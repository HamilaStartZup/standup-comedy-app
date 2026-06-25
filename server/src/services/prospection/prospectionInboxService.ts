import { Types } from 'mongoose';
import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { config } from '../../config/env';
import { ProspectedVenueModel } from '../../models/ProspectedVenue';
import { ProspectionInboxMessageModel } from '../../models/ProspectionInboxMessage';

const SYNC_LOOKBACK_DAYS = 30;
const SNIPPET_MAX_LENGTH = 400;

const AUTO_REPLY_HEADERS = ['auto-submitted', 'x-autoreply', 'x-autorespond'];
const AUTO_REPLY_SUBJECT_PREFIXES = [
  'automatic reply',
  'auto reply',
  'out of office',
  'réponse automatique',
  'absence du bureau',
  'autoreply',
];

export function isProspectionImapConfigured(): boolean {
  return Boolean(config.prospection.imap.user && config.prospection.imap.pass);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function extractEmailFromAddress(value: string): string | null {
  const trimmed = value.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return normalizeEmail(angleMatch[1]);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return normalizeEmail(trimmed);
  return null;
}

function isAutoReply(parsed: ParsedMail): boolean {
  for (const header of AUTO_REPLY_HEADERS) {
    const value = parsed.headers.get(header);
    if (value && String(value).toLowerCase() !== 'no') return true;
  }
  const subject = (parsed.subject ?? '').toLowerCase();
  return AUTO_REPLY_SUBJECT_PREFIXES.some((prefix) => subject.startsWith(prefix));
}

function buildSnippet(parsed: ParsedMail): string {
  const text = (parsed.text ?? '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, SNIPPET_MAX_LENGTH);
  const htmlRaw = typeof parsed.html === 'string' ? parsed.html : '';
  const html = htmlRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return html.slice(0, SNIPPET_MAX_LENGTH);
}

function isProspectionRelated(parsed: ParsedMail, senderEmail: string, knownVenueEmails: Set<string>): boolean {
  if (knownVenueEmails.has(senderEmail)) return true;
  const subject = (parsed.subject ?? '').toLowerCase();
  const prospectionMarkers = ['connect comedy club', 'découvrez connect', 'petit suivi concernant connect'];
  return prospectionMarkers.some((marker) => subject.includes(marker));
}

async function matchVenueByEmail(email: string): Promise<string | null> {
  const venue = await ProspectedVenueModel.findOne({ email }).select('_id').lean();
  return venue ? venue._id.toString() : null;
}

export async function syncProspectionInbox(): Promise<{
  imported: number;
  skipped: number;
  matched: number;
  errors: string[];
}> {
  if (!isProspectionImapConfigured()) {
    throw new Error('Boîte IMAP non configurée (PROSPECTION_IMAP_USER / PROSPECTION_IMAP_PASS)');
  }

  const ownEmail = normalizeEmail(config.prospection.imap.user);
  const since = new Date();
  since.setDate(since.getDate() - SYNC_LOOKBACK_DAYS);

  const latest = await ProspectionInboxMessageModel.findOne().sort({ receivedAt: -1 }).select('receivedAt').lean();
  const searchSince = latest?.receivedAt && latest.receivedAt > since ? latest.receivedAt : since;

  const knownVenues = await ProspectedVenueModel.find({
    email: { $type: 'string', $gt: '' },
  }).select('email').lean();
  const knownVenueEmails = new Set(
    knownVenues.map((v) => normalizeEmail(v.email!))
  );

  const client = new ImapFlow({
    host: config.prospection.imap.host,
    port: config.prospection.imap.port,
    secure: true,
    auth: {
      user: config.prospection.imap.user,
      pass: config.prospection.imap.pass,
    },
    logger: false,
  });

  let imported = 0;
  let skipped = 0;
  let matched = 0;
  const errors: string[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.prospection.imap.mailbox);
    try {
      for await (const message of client.fetch(
        { since: searchSince },
        { uid: true, source: true, envelope: true }
      )) {
        try {
          if (!message.source) {
            skipped++;
            continue;
          }

          const parsed = await simpleParser(message.source);
          const messageId = (parsed.messageId ?? `uid-${message.uid}`).trim();
          const exists = await ProspectionInboxMessageModel.exists({ messageId });
          if (exists) {
            skipped++;
            continue;
          }

          const envelopeFrom = message.envelope?.from?.[0];
          const senderEmail =
            extractEmailFromAddress(envelopeFrom?.address ?? '') ??
            extractEmailFromAddress(parsed.from?.text ?? '') ??
            (parsed.from?.value?.[0]?.address
              ? normalizeEmail(parsed.from.value[0].address)
              : null);

          if (!senderEmail || senderEmail === ownEmail) {
            skipped++;
            continue;
          }

          if (isAutoReply(parsed)) {
            skipped++;
            continue;
          }

          if (!isProspectionRelated(parsed, senderEmail, knownVenueEmails)) {
            skipped++;
            continue;
          }

          const venueId = await matchVenueByEmail(senderEmail);
          if (venueId) matched++;

          const fromName =
            envelopeFrom?.name ??
            parsed.from?.value?.[0]?.name ??
            null;

          await ProspectionInboxMessageModel.create({
            messageId,
            from: senderEmail,
            fromName,
            subject: parsed.subject ?? '(sans objet)',
            snippet: buildSnippet(parsed),
            receivedAt: parsed.date ?? new Date(),
            venueId: venueId ?? null,
            handled: false,
          });

          imported++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erreur message';
          errors.push(msg);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erreur IMAP';
    throw new Error(`Synchronisation IMAP échouée : ${msg}`);
  }

  return { imported, skipped, matched, errors };
}

export async function listProspectionInboxMessages(options: {
  page: number;
  limit: number;
  unhandledOnly?: boolean;
}) {
  const filter: Record<string, unknown> = {};
  if (options.unhandledOnly) filter.handled = false;

  const skip = (options.page - 1) * options.limit;
  const [messages, total] = await Promise.all([
    ProspectionInboxMessageModel.find(filter)
      .sort({ receivedAt: -1 })
      .skip(skip)
      .limit(options.limit)
      .populate('venueId', 'name email emailStatus')
      .lean(),
    ProspectionInboxMessageModel.countDocuments(filter),
  ]);

  return {
    messages: messages.map((m) => ({
      _id: m._id.toString(),
      messageId: m.messageId,
      from: m.from,
      fromName: m.fromName,
      subject: m.subject,
      snippet: m.snippet,
      receivedAt: m.receivedAt,
      handled: m.handled,
      venue: m.venueId && typeof m.venueId === 'object' && '_id' in m.venueId
        ? {
            _id: String((m.venueId as { _id: unknown })._id),
            name: (m.venueId as { name?: string }).name ?? '',
            email: (m.venueId as { email?: string | null }).email ?? null,
            emailStatus: (m.venueId as { emailStatus?: string }).emailStatus ?? null,
          }
        : null,
    })),
    pagination: {
      page: options.page,
      limit: options.limit,
      total,
      totalPages: Math.ceil(total / options.limit) || 1,
    },
    configured: isProspectionImapConfigured(),
    webmailUrl: config.prospection.webmailUrl,
  };
}

export async function markInboxMessageAsReplied(messageId: string): Promise<{
  message: { _id: string; handled: boolean };
  venue: { _id: string; emailStatus: string } | null;
}> {
  const inboxMessage = await ProspectionInboxMessageModel.findById(messageId);
  if (!inboxMessage) {
    throw new Error('Message introuvable');
  }

  inboxMessage.handled = true;
  await inboxMessage.save();

  let venue: { _id: string; emailStatus: string } | null = null;

  if (inboxMessage.venueId) {
    const updatedVenue = await ProspectedVenueModel.findByIdAndUpdate(
      inboxMessage.venueId,
      { $set: { emailStatus: 'repondu', optOut: false } },
      { new: true }
    ).select('_id emailStatus');

    if (updatedVenue) {
      venue = {
        _id: updatedVenue._id.toString(),
        emailStatus: updatedVenue.emailStatus,
      };
    }
  } else {
    const matchedVenue = await ProspectedVenueModel.findOneAndUpdate(
      { email: inboxMessage.from },
      { $set: { emailStatus: 'repondu', optOut: false } },
      { new: true }
    ).select('_id emailStatus');

    if (matchedVenue) {
      inboxMessage.venueId = matchedVenue._id as Types.ObjectId;
      await inboxMessage.save();
      venue = {
        _id: matchedVenue._id.toString(),
        emailStatus: matchedVenue.emailStatus,
      };
    }
  }

  return {
    message: { _id: inboxMessage._id.toString(), handled: inboxMessage.handled },
    venue,
  };
}
