import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Navbar from '../components/Navbar';
import Pagination from '../components/Pagination';
import ProspectedVenueModal from '../components/ProspectedVenueModal';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import {
  getProspectionConfig,
  patchProspectionConfig,
  runProspection,
  getProspectionRun,
  listProspectionRuns,
  clearProspectionRuns,
  listProspectedVenues,
  createProspectedVenue,
  updateProspectedVenue,
  deleteProspectedVenue,
  enrichProspectionVenues,
  getProspectionInboxStatus,
  listProspectionInbox,
  syncProspectionInbox,
  markProspectionInboxReplied,
} from '../services/api';
import { getErrorMessage } from '../services/systemMessages';
import {
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_OPTIONS,
  SOURCE_LABELS,
  VENUE_TYPE_OPTIONS,
  WEEKDAY_OPTIONS,
  type IProspectionConfig,
  type IProspectionInboxMessage,
  type IProspectionRun,
  type IProspectedVenue,
  type ProspectedEmailStatus,
  type ProspectedVenueInput,
  type ProspectedVenueType,
} from '../types/prospection';

function venueToInput(venue: IProspectedVenue): ProspectedVenueInput {
  return {
    name: venue.name,
    type: venue.type,
    email: venue.email ?? '',
    phone: venue.phone ?? '',
    street: venue.address.street ?? '',
    city: venue.address.city ?? '',
    postalCode: venue.address.postalCode ?? '',
    departement: venue.address.departement ?? '',
    website: venue.website ?? '',
    emailStatus: venue.emailStatus,
  };
}

const cardStyle: React.CSSProperties = {
  background: 'var(--ccc-bg-elevated)',
  border: '1px solid var(--ccc-border-subtle)',
  borderRadius: 16,
  padding: 24,
  marginBottom: 24,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--ccc-text-secondary)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid var(--ccc-border-medium)',
  background: 'var(--ccc-bg-surface)',
  color: 'var(--ccc-text-primary)',
  fontSize: 14,
};

const ProspectionPage: React.FC = () => {
  const { user } = useAuth();
  const { showSuccess, showError } = useAlert();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [configForm, setConfigForm] = useState<IProspectionConfig | null>(null);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [pendingDepartments, setPendingDepartments] = useState<string[]>([]);
  const [isDepartmentsDropdownOpen, setIsDepartmentsDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [manualDryRun, setManualDryRun] = useState(false);
  const [manualMaxEmails, setManualMaxEmails] = useState<number | ''>('');

  const [venuePage, setVenuePage] = useState(1);
  const [venueDept, setVenueDept] = useState('');
  const [venueType, setVenueType] = useState('');
  const [venueStatus, setVenueStatus] = useState('');
  const [venueContactFilter, setVenueContactFilter] = useState<
    '' | 'with_email' | 'without_email' | 'with_phone' | 'without_phone' | 'with_email_and_phone' | 'without_email_and_phone'
  >('');
  const [venueSearch, setVenueSearch] = useState('');
  const [enriching, setEnriching] = useState(false);
  const [clearingRuns, setClearingRuns] = useState(false);
  const [venueModalOpen, setVenueModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<IProspectedVenue | null>(null);
  const [savingVenue, setSavingVenue] = useState(false);
  const [updatingVenueStatusId, setUpdatingVenueStatusId] = useState<string | null>(null);
  const [inboxUnhandledOnly, setInboxUnhandledOnly] = useState(true);
  const [syncingInbox, setSyncingInbox] = useState(false);
  const [markingInboxId, setMarkingInboxId] = useState<string | null>(null);

  const { data: configData, isLoading: loadingConfig } = useQuery({
    queryKey: ['prospection-config'],
    queryFn: getProspectionConfig,
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (configData) {
      setConfigForm(configData.config);
      setDepartments(configData.departments);
      setPendingDepartments(configData.config.cibles.departements);
      setManualMaxEmails(configData.config.envoi.maxEmailsParRun);
    }
  }, [configData]);

  const { data: runsData, refetch: refetchRuns } = useQuery({
    queryKey: ['prospection-runs'],
    queryFn: () => listProspectionRuns(15),
    enabled: isSuperAdmin,
    refetchInterval: activeRunId ? 3000 : false,
  });

  const { data: venuesData, isLoading: loadingVenues } = useQuery({
    queryKey: ['prospected-venues', venuePage, venueDept, venueType, venueStatus, venueContactFilter, venueSearch],
    queryFn: () => listProspectedVenues({
      page: venuePage,
      limit: 15,
      departement: venueDept || undefined,
      type: venueType || undefined,
      emailStatus: venueStatus || undefined,
      hasEmail:
        venueContactFilter === 'with_email'
          ? 'true'
          : venueContactFilter === 'without_email' || venueContactFilter === 'without_email_and_phone'
            ? 'false'
            : undefined,
      hasPhone:
        venueContactFilter === 'with_phone'
          ? 'true'
          : venueContactFilter === 'without_phone' || venueContactFilter === 'without_email_and_phone'
            ? 'false'
            : undefined,
      hasAnyContact: venueContactFilter === 'with_email_and_phone' ? 'true' : undefined,
      search: venueSearch || undefined,
    }),
    enabled: isSuperAdmin,
  });

  const { data: inboxStatus } = useQuery({
    queryKey: ['prospection-inbox-status'],
    queryFn: getProspectionInboxStatus,
    enabled: isSuperAdmin,
  });

  const { data: inboxData, isLoading: loadingInbox, refetch: refetchInbox } = useQuery({
    queryKey: ['prospection-inbox', inboxUnhandledOnly],
    queryFn: () => listProspectionInbox({ page: 1, limit: 20, unhandledOnly: inboxUnhandledOnly }),
    enabled: isSuperAdmin,
  });

  useEffect(() => {
    if (!activeRunId) return;
    const poll = async () => {
      try {
        const { run } = await getProspectionRun(activeRunId);
        if (run.status !== 'running') {
          setActiveRunId(null);
          refetchRuns();
          queryClient.invalidateQueries({ queryKey: ['prospected-venues'] });
          if (run.status === 'done') {
            showSuccess(
              `Prospection terminée — ${run.stats.new} nouveau(x), ${run.stats.merged ?? 0} fusionné(s), ${run.stats.websitesFound ?? 0} site(s), ${run.stats.emailsEnriched ?? 0} email(s) enrichi(s), ${run.stats.emailsSent} envoyé(s)`
            );
          } else {
            showError(run.error || 'La prospection a échoué');
          }
        }
      } catch {
        setActiveRunId(null);
      }
    };
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [activeRunId, queryClient, refetchRuns, showError, showSuccess]);

  const togglePendingDepartment = (code: string) => {
    if (!configForm) return;
    const nextDepartments = pendingDepartments.includes(code)
      ? pendingDepartments.filter((d) => d !== code)
      : [...pendingDepartments, code];

    setPendingDepartments(nextDepartments);
    setConfigForm({
      ...configForm,
      cibles: { ...configForm.cibles, departements: nextDepartments },
    });
  };

  const toggleType = (type: ProspectedVenueType) => {
    if (!configForm) return;
    const current = configForm.cibles.types;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setConfigForm({ ...configForm, cibles: { ...configForm.cibles, types: next } });
  };

  const toggleWeekday = (day: number) => {
    if (!configForm) return;
    const current = configForm.cron.joursActifs;
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day];
    setConfigForm({ ...configForm, cron: { ...configForm.cron, joursActifs: next } });
  };

  const handleSaveConfig = async () => {
    if (!configForm) return;
    setSaving(true);
    try {
      await patchProspectionConfig({
        mode: configForm.mode,
        cron: configForm.cron,
        cibles: configForm.cibles,
        envoi: configForm.envoi,
      });
      showSuccess('Configuration enregistrée');
      queryClient.invalidateQueries({ queryKey: ['prospection-config'] });
    } catch (err) {
      showError(getErrorMessage(err, 'Impossible d\'enregistrer la configuration'));
    } finally {
      setSaving(false);
    }
  };

  const handleRunProspection = async () => {
    if (!configForm) return;
    setRunning(true);
    try {
      const { runId } = await runProspection({
        departements: configForm.cibles.departements,
        types: configForm.cibles.types,
        maxEmails: manualMaxEmails === '' ? undefined : Number(manualMaxEmails),
        dryRun: manualDryRun,
      });
      setActiveRunId(runId);
      showSuccess('Prospection lancée — suivi en cours…');
      refetchRuns();
    } catch (err) {
      showError(getErrorMessage(err, 'Impossible de lancer la prospection'));
    } finally {
      setRunning(false);
    }
  };

  const handleEnrichVenues = async () => {
    setEnriching(true);
    try {
      const result = await enrichProspectionVenues({
        limit: 30,
        departements: venueDept ? [venueDept] : undefined,
      });
      showSuccess(result.message);
      queryClient.invalidateQueries({ queryKey: ['prospected-venues'] });
    } catch (err) {
      showError(getErrorMessage(err, 'Enrichissement impossible'));
    } finally {
      setEnriching(false);
    }
  };

  const openCreateVenueModal = () => {
    setEditingVenue(null);
    setVenueModalOpen(true);
  };

  const openEditVenueModal = (venue: IProspectedVenue) => {
    setEditingVenue(venue);
    setVenueModalOpen(true);
  };

  const closeVenueModal = () => {
    if (savingVenue) return;
    setVenueModalOpen(false);
    setEditingVenue(null);
  };

  const handleSaveVenue = async (payload: ProspectedVenueInput) => {
    setSavingVenue(true);
    try {
      if (editingVenue) {
        await updateProspectedVenue(editingVenue._id, payload);
        showSuccess('Lieu mis à jour');
      } else {
        await createProspectedVenue(payload);
        showSuccess('Lieu ajouté');
      }
      setVenueModalOpen(false);
      setEditingVenue(null);
      queryClient.invalidateQueries({ queryKey: ['prospected-venues'] });
    } catch (err) {
      showError(getErrorMessage(err, 'Impossible d\'enregistrer le lieu'));
    } finally {
      setSavingVenue(false);
    }
  };

  const handleVenueStatusChange = async (venue: IProspectedVenue, emailStatus: ProspectedEmailStatus) => {
    if (emailStatus === venue.emailStatus) return;

    setUpdatingVenueStatusId(venue._id);
    try {
      await updateProspectedVenue(venue._id, { ...venueToInput(venue), emailStatus });
      queryClient.invalidateQueries({ queryKey: ['prospected-venues'] });
      showSuccess(`Statut mis à jour : ${EMAIL_STATUS_LABELS[emailStatus]}`);
    } catch (err) {
      showError(getErrorMessage(err, 'Impossible de mettre à jour le statut'));
    } finally {
      setUpdatingVenueStatusId(null);
    }
  };

  const handleSyncInbox = async () => {
    setSyncingInbox(true);
    try {
      const result = await syncProspectionInbox();
      showSuccess(result.message);
      await refetchInbox();
      queryClient.invalidateQueries({ queryKey: ['prospected-venues'] });
    } catch (err) {
      showError(getErrorMessage(err, 'Synchronisation impossible'));
    } finally {
      setSyncingInbox(false);
    }
  };

  const handleMarkInboxReplied = async (message: IProspectionInboxMessage) => {
    setMarkingInboxId(message._id);
    try {
      const result = await markProspectionInboxReplied(message._id);
      if (result.venue) {
        showSuccess(`Réponse traitée — ${message.venue?.name ?? 'lieu'} marqué comme répondu`);
      } else {
        showSuccess('Message marqué comme traité (aucun lieu correspondant en base)');
      }
      await refetchInbox();
      queryClient.invalidateQueries({ queryKey: ['prospected-venues'] });
    } catch (err) {
      showError(getErrorMessage(err, 'Impossible de marquer la réponse'));
    } finally {
      setMarkingInboxId(null);
    }
  };

  const handleDeleteVenue = async (venue: IProspectedVenue) => {
    const confirmed = window.confirm(`Supprimer « ${venue.name} » ? Cette action est irréversible.`);
    if (!confirmed) return;

    try {
      await deleteProspectedVenue(venue._id);
      showSuccess('Lieu supprimé');
      queryClient.invalidateQueries({ queryKey: ['prospected-venues'] });
    } catch (err) {
      showError(getErrorMessage(err, 'Impossible de supprimer le lieu'));
    }
  };

  const handleClearRuns = async () => {
    const confirmed = window.confirm('Effacer tout l’historique des exécutions ? Cette action est irréversible.');
    if (!confirmed) return;

    setClearingRuns(true);
    try {
      const result = await clearProspectionRuns();
      showSuccess(`${result.deletedCount} exécution(s) supprimée(s).`);
      refetchRuns();
    } catch (err) {
      showError(getErrorMessage(err, 'Impossible d’effacer l’historique'));
    } finally {
      setClearingRuns(false);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--ccc-bg-gradient)' }}>
        <Navbar />
        <div style={{ textAlign: 'center', padding: 80 }}>
          <h2>Accès refusé</h2>
          <p>Seuls les super-admins peuvent accéder à cette page.</p>
        </div>
      </div>
    );
  }

  if (loadingConfig || !configForm) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--ccc-bg-gradient)' }}>
        <Navbar />
        <div style={{ textAlign: 'center', padding: 80, color: 'var(--ccc-text-muted)' }}>
          Chargement de la prospection…
        </div>
      </div>
    );
  }

  const runs: IProspectionRun[] = runsData?.runs ?? [];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ccc-bg-gradient)', color: 'var(--ccc-text-primary)' }}>
      <Navbar />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 20px 60px' }}>
        <h1 className="ccc-page-title">Prospection</h1>
        <p style={{ color: 'var(--ccc-text-muted)', marginBottom: 28, marginTop: -8 }}>
          Recherche via données ouvertes (BPE INSEE, Basilic Culture, OpenStreetMap) puis enrichissement web
          (sites + emails). Sources : <code>PROSPECTION_SEARCH_SOURCES</code> — par défaut{' '}
          <code>bpe,overpass,data_gouv,scraping,google</code>.
        </p>

        {/* Mode */}
        <section style={cardStyle}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Mode</h2>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(320px, 1.4fr) minmax(220px, 1fr)',
              gap: 16,
            }}
          >
            <div
              style={{
                border: '1px solid var(--ccc-border-subtle)',
                borderRadius: 12,
                padding: 14,
                background: 'var(--ccc-bg-surface)',
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(['manuel', 'auto'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setConfigForm({ ...configForm, mode })}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 10,
                      border: `2px solid ${configForm.mode === mode ? '#7c3aed' : 'var(--ccc-border-medium)'}`,
                      background: configForm.mode === mode ? 'rgba(124,58,237,0.12)' : 'transparent',
                      color: configForm.mode === mode ? '#7c3aed' : 'var(--ccc-text-primary)',
                      fontWeight: configForm.mode === mode ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {mode === 'auto' ? 'Automatique (cron)' : 'Manuel'}
                  </button>
                ))}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ccc-text-muted)', margin: '12px 0 0' }}>
                {configForm.mode === 'auto'
                  ? 'Le cron enverra des emails selon la fréquence configurée ci-dessous.'
                  : 'Seul le bouton « Lancer la prospection » déclenche un envoi.'}
              </p>
            </div>

            <div
              style={{
                border: '1px solid var(--ccc-border-subtle)',
                borderRadius: 12,
                padding: 14,
                background: 'var(--ccc-bg-surface)',
                display: 'grid',
                gap: 8,
                alignContent: 'start',
              }}
            >
              <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--ccc-text-muted)' }}>
                Aperçu
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {configForm.mode === 'auto' ? 'Automatique (cron)' : 'Manuel'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ccc-text-secondary)' }}>
                {configForm.mode === 'auto'
                  ? `Jours actifs: ${configForm.cron.joursActifs.length || 0} • Heure: ${configForm.cron.heureEnvoi}`
                  : 'Déclenchement à la demande uniquement'}
              </div>
            </div>
          </div>
        </section>

        {/* Fréquence cron */}
        {configForm.mode === 'auto' && (
          <section style={cardStyle}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Fréquence (cron)</h2>
            <div style={{ marginBottom: 16 }}>
              <span style={labelStyle}>Jours actifs</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {WEEKDAY_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleWeekday(value)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: `1px solid ${configForm.cron.joursActifs.includes(value) ? '#7c3aed' : 'var(--ccc-border-medium)'}`,
                      background: configForm.cron.joursActifs.includes(value) ? 'rgba(124,58,237,0.15)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ maxWidth: 200 }}>
              <label style={labelStyle}>Heure d&apos;envoi</label>
              <input
                type="time"
                value={configForm.cron.heureEnvoi}
                onChange={(e) => setConfigForm({
                  ...configForm,
                  cron: { ...configForm.cron, heureEnvoi: e.target.value },
                })}
                style={inputStyle}
              />
            </div>
            <p style={{ fontSize: 12, color: 'var(--ccc-text-muted)', marginTop: 12 }}>
              Expression cron : <code>{configForm.cron.expression}</code>
              {configForm.cron.prochainRun && (
                <> — Prochain run estimé : {new Date(configForm.cron.prochainRun).toLocaleString('fr-FR')}</>
              )}
            </p>
          </section>
        )}

        {/* Cibles */}
        <section style={cardStyle}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Cibles par défaut</h2>
          <div style={{ marginBottom: 20 }}>
            <span style={labelStyle}>Types de lieux</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {VENUE_TYPE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleType(value)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 8,
                    border: `1px solid ${configForm.cibles.types.includes(value) ? '#7c3aed' : 'var(--ccc-border-medium)'}`,
                    background: configForm.cibles.types.includes(value) ? 'rgba(124,58,237,0.12)' : 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span style={labelStyle}>Départements ({pendingDepartments.length} sélectionné(s))</span>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsDepartmentsDropdownOpen((open) => !open)}
                style={{
                  ...inputStyle,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span>
                  {pendingDepartments.length === 0
                    ? 'Choisir des départements'
                    : `${pendingDepartments.length} département(s) sélectionné(s)`}
                </span>
                <span style={{ opacity: 0.7 }}>{isDepartmentsDropdownOpen ? '▲' : '▼'}</span>
              </button>

              {isDepartmentsDropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    zIndex: 20,
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    maxHeight: 260,
                    overflowY: 'auto',
                    border: '1px solid var(--ccc-border-medium)',
                    borderRadius: 10,
                    background: 'var(--ccc-bg-elevated)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
                    padding: 6,
                  }}
                >
                  {Object.entries(departments).map(([code, name]) => {
                    const selected = pendingDepartments.includes(code);
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => togglePendingDepartment(code)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          textAlign: 'left',
                          padding: '7px 8px',
                          borderRadius: 8,
                          border: 'none',
                          background: selected ? 'rgba(124,58,237,0.12)' : 'transparent',
                          color: selected ? '#6d28d9' : 'var(--ccc-text-primary)',
                          cursor: 'pointer',
                          fontSize: 13,
                        }}
                      >
                        <span style={{ width: 14, fontWeight: 700 }}>{selected ? '✓' : ''}</span>
                        <span>{code} — {name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <p style={{ fontSize: 12, color: 'var(--ccc-text-muted)', marginTop: 8 }}>
              Résumé :{' '}
              {pendingDepartments.length === 0
                ? 'aucun département sélectionné'
                : pendingDepartments
                  .map((code) => `${code} — ${departments[code]}`)
                  .join(', ')}
            </p>
          </div>
        </section>

        {/* Paramètres envoi */}
        <section style={cardStyle}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Paramètres d&apos;envoi</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <div>
              <label style={labelStyle}>Emails max par run</label>
              <input
                type="number"
                min={1}
                max={200}
                value={configForm.envoi.maxEmailsParRun}
                onChange={(e) => setConfigForm({
                  ...configForm,
                  envoi: { ...configForm.envoi, maxEmailsParRun: Number(e.target.value) },
                })}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Délai entre envois (sec.)</label>
              <input
                type="number"
                min={2}
                max={30}
                value={configForm.envoi.delaiEntreEnvois}
                onChange={(e) => setConfigForm({
                  ...configForm,
                  envoi: { ...configForm.envoi, delaiEntreEnvois: Number(e.target.value) },
                })}
                style={inputStyle}
              />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={configForm.envoi.dryRunParDefaut}
              onChange={(e) => setConfigForm({
                ...configForm,
                envoi: { ...configForm.envoi, dryRunParDefaut: e.target.checked },
              })}
            />
            <span>Dry run par défaut (le cron simule sans envoyer)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={configForm.envoi.relance72hActive}
              onChange={(e) => setConfigForm({
                ...configForm,
                envoi: { ...configForm.envoi, relance72hActive: e.target.checked },
              })}
            />
            <span>Activer la relance automatique (lundi → lundi suivant, jeudi → mardi suivant)</span>
          </label>
        </section>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
          <button
            type="button"
            onClick={handleSaveConfig}
            disabled={saving}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              border: 'none',
              background: '#7c3aed',
              color: '#fff',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer la configuration'}
          </button>
        </div>

        {/* Lancement manuel */}
        <section style={cardStyle}>
          <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>Lancer la prospection</h2>
          <p style={{ fontSize: 13, color: 'var(--ccc-text-muted)', marginBottom: 16 }}>
            Utilise les cibles ci-dessus. Vous pouvez surcharger le quota ou activer un dry run pour ce run uniquement.
          </p>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
            <div style={{ maxWidth: 160 }}>
              <label style={labelStyle}>Max emails (ce run)</label>
              <input
                type="number"
                min={1}
                max={200}
                value={manualMaxEmails}
                onChange={(e) => setManualMaxEmails(e.target.value === '' ? '' : Number(e.target.value))}
                style={inputStyle}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', paddingBottom: 10 }}>
              <input type="checkbox" checked={manualDryRun} onChange={(e) => setManualDryRun(e.target.checked)} />
              <span>Dry run (simulation)</span>
            </label>
          </div>
          <button
            type="button"
            onClick={handleRunProspection}
            disabled={running || !!activeRunId}
            style={{
              padding: '12px 28px',
              borderRadius: 10,
              border: 'none',
              background: activeRunId ? '#94a3b8' : '#059669',
              color: '#fff',
              fontWeight: 700,
              cursor: running || activeRunId ? 'not-allowed' : 'pointer',
            }}
          >
            {activeRunId ? 'Prospection en cours…' : running ? 'Démarrage…' : 'Lancer la prospection'}
          </button>
        </section>

        {/* Historique runs */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Historique des exécutions</h2>
            <button
              type="button"
              onClick={handleClearRuns}
              disabled={clearingRuns || runs.length === 0}
              style={{
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid #dc2626',
                background: 'transparent',
                color: '#dc2626',
                fontWeight: 600,
                cursor: clearingRuns || runs.length === 0 ? 'not-allowed' : 'pointer',
                opacity: clearingRuns || runs.length === 0 ? 0.5 : 1,
              }}
            >
              {clearingRuns ? 'Suppression…' : 'Effacer l’historique'}
            </button>
          </div>
          {runs.length === 0 ? (
            <p style={{ color: 'var(--ccc-text-muted)' }}>Aucune exécution pour le moment.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ccc-border-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Date</th>
                    <th style={{ padding: 8 }}>Déclencheur</th>
                    <th style={{ padding: 8 }}>Statut</th>
                    <th style={{ padding: 8 }}>Trouvés</th>
                    <th style={{ padding: 8 }}>Nouveaux</th>
                    <th style={{ padding: 8 }}>Fusionnés</th>
                    <th style={{ padding: 8 }}>Sites web</th>
                    <th style={{ padding: 8 }}>Emails enrichis</th>
                    <th style={{ padding: 8 }}>Emails envoyés</th>
                    <th style={{ padding: 8 }}>Dry run</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run._id} style={{ borderBottom: '1px solid var(--ccc-border-subtle)' }}>
                      <td style={{ padding: 8 }}>{new Date(run.startedAt).toLocaleString('fr-FR')}</td>
                      <td style={{ padding: 8 }}>{run.trigger === 'cron' ? 'Auto' : 'Manuel'}</td>
                      <td style={{ padding: 8 }}>
                        <span style={{
                          color: run.status === 'done' ? '#059669' : run.status === 'error' ? '#dc2626' : '#d97706',
                          fontWeight: 600,
                        }}>
                          {run.status === 'running' ? 'En cours' : run.status === 'done' ? 'Terminé' : 'Erreur'}
                        </span>
                      </td>
                      <td style={{ padding: 8 }}>{run.stats.found}</td>
                      <td style={{ padding: 8 }}>{run.stats.new}</td>
                      <td style={{ padding: 8 }}>{run.stats.merged ?? 0}</td>
                      <td style={{ padding: 8 }}>{run.stats.websitesFound ?? 0}</td>
                      <td style={{ padding: 8 }}>{run.stats.emailsEnriched ?? 0}</td>
                      <td style={{ padding: 8 }}>{run.stats.emailsSent} / {run.stats.emailsFailed} échec(s)</td>
                      <td style={{ padding: 8 }}>{run.filtres.dryRun ? 'Oui' : 'Non'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Réponses boîte prospection */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Réponses prospection</h2>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ccc-text-muted)' }}>
                Synchronisation IMAP de {inboxStatus?.imapUser ?? 'contact@connectcomedyclub.com'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={inboxUnhandledOnly}
                  onChange={(e) => setInboxUnhandledOnly(e.target.checked)}
                />
                Non traitées uniquement
              </label>
              {inboxStatus?.webmailUrl && (
                <a
                  href={inboxStatus.webmailUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--ccc-border-medium)',
                    color: 'var(--ccc-text-primary)',
                    textDecoration: 'none',
                    fontSize: 13,
                  }}
                >
                  Ouvrir le webmail OVH
                </a>
              )}
              <button
                type="button"
                onClick={handleSyncInbox}
                disabled={syncingInbox || !inboxStatus?.configured}
                style={{
                  padding: '8px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#7c3aed',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: syncingInbox || !inboxStatus?.configured ? 'not-allowed' : 'pointer',
                  opacity: syncingInbox || !inboxStatus?.configured ? 0.6 : 1,
                }}
              >
                {syncingInbox ? 'Synchronisation…' : 'Actualiser les réponses'}
              </button>
            </div>
          </div>

          {!inboxStatus?.configured ? (
            <p style={{ margin: 0, fontSize: 13, color: '#d97706' }}>
              Boîte IMAP non configurée côté serveur. Ajoutez{' '}
              <code>PROSPECTION_IMAP_USER</code> et <code>PROSPECTION_IMAP_PASS</code> dans le fichier{' '}
              <code>.env</code> du serveur (compte OVH contact@connectcomedyclub.com).
            </p>
          ) : loadingInbox ? (
            <p style={{ color: 'var(--ccc-text-muted)' }}>Chargement des réponses…</p>
          ) : (inboxData?.messages.length ?? 0) === 0 ? (
            <p style={{ color: 'var(--ccc-text-muted)' }}>
              Aucune réponse importée pour le moment. Cliquez sur « Actualiser les réponses » pour synchroniser la boîte OVH.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {inboxData?.messages.map((message) => (
                <div
                  key={message._id}
                  style={{
                    border: '1px solid var(--ccc-border-subtle)',
                    borderRadius: 12,
                    padding: 14,
                    background: message.handled ? 'var(--ccc-bg-surface)' : 'rgba(124, 58, 237, 0.06)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {message.venue?.name ?? message.fromName ?? message.from}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ccc-text-muted)' }}>
                        {message.from}
                        {message.venue ? ` · Lieu identifié` : ' · Expéditeur non reconnu en base'}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--ccc-text-muted)' }}>
                      {new Date(message.receivedAt).toLocaleString('fr-FR')}
                    </div>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{message.subject}</div>
                  <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ccc-text-secondary)', lineHeight: 1.5 }}>
                    {message.snippet || '—'}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {message.venue && (
                      <span style={{ fontSize: 12, color: 'var(--ccc-text-muted)' }}>
                        Statut actuel : {EMAIL_STATUS_LABELS[message.venue.emailStatus as ProspectedEmailStatus] ?? message.venue.emailStatus}
                      </span>
                    )}
                    {!message.handled && (
                      <button
                        type="button"
                        onClick={() => handleMarkInboxReplied(message)}
                        disabled={markingInboxId === message._id}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          border: 'none',
                          background: '#059669',
                          color: '#fff',
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: markingInboxId === message._id ? 'wait' : 'pointer',
                          opacity: markingInboxId === message._id ? 0.7 : 1,
                        }}
                      >
                        {markingInboxId === message._id ? 'Traitement…' : 'Marquer comme répondu'}
                      </button>
                    )}
                    {message.handled && (
                      <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>Traité</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tableau lieux */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Lieux prospectés</h2>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={openCreateVenueModal}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#7c3aed',
                  color: '#fff',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Ajouter un lieu
              </button>
              <button
                type="button"
                onClick={handleEnrichVenues}
                disabled={enriching}
                style={{
                  padding: '10px 16px',
                  borderRadius: 10,
                  border: '1px solid var(--ccc-border-medium)',
                  background: 'var(--ccc-bg-surface)',
                  color: 'var(--ccc-text-primary)',
                  fontWeight: 600,
                  cursor: enriching ? 'wait' : 'pointer',
                  opacity: enriching ? 0.7 : 1,
                }}
              >
                {enriching ? 'Enrichissement…' : 'Enrichir sites & emails (30)'}
              </button>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(220px, 1fr))',
              gap: 10,
              marginBottom: 16,
            }}
          >
            <input
              type="text"
              placeholder="Rechercher…"
              value={venueSearch}
              onChange={(e) => { setVenueSearch(e.target.value); setVenuePage(1); }}
              style={{ ...inputStyle, gridColumn: '1 / -1' }}
            />
            <select value={venueDept} onChange={(e) => { setVenueDept(e.target.value); setVenuePage(1); }} style={inputStyle}>
              <option value="">Tous départements</option>
              {Object.entries(departments).map(([code, name]) => (
                <option key={code} value={code}>{code} — {name}</option>
              ))}
            </select>
            <select value={venueType} onChange={(e) => { setVenueType(e.target.value); setVenuePage(1); }} style={inputStyle}>
              <option value="">Tous types</option>
              {VENUE_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={venueContactFilter}
              onChange={(e) => {
                setVenueContactFilter(
                  e.target.value as '' | 'with_email' | 'without_email' | 'with_phone' | 'without_phone' | 'with_email_and_phone' | 'without_email_and_phone'
                );
                setVenuePage(1);
              }}
              style={inputStyle}
            >
              <option value="">Tous (email/téléphone)</option>
              <option value="with_email">Avec mails</option>
              <option value="without_email">Sans mails</option>
              <option value="with_phone">Avec téléphone</option>
              <option value="without_phone">Sans téléphone</option>
              <option value="with_email_and_phone">Avec mail + tel</option>
              <option value="without_email_and_phone">Sans mail + tel</option>
            </select>
            <select value={venueStatus} onChange={(e) => { setVenueStatus(e.target.value); setVenuePage(1); }} style={inputStyle}>
              <option value="">Tous statuts envoi</option>
              {Object.entries(EMAIL_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          {venuesData && (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ccc-text-muted)' }}>
              {venuesData.pagination.total} lieu(x) correspondant aux filtres
            </p>
          )}

          {loadingVenues ? (
            <p style={{ color: 'var(--ccc-text-muted)' }}>Chargement…</p>
          ) : (venuesData?.venues.length ?? 0) === 0 ? (
            <p style={{ color: 'var(--ccc-text-muted)' }}>Aucun lieu prospecté. Lancez une prospection pour commencer.</p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--ccc-border-subtle)', textAlign: 'left' }}>
                      <th style={{ padding: 8 }}>Nom</th>
                      <th style={{ padding: 8 }}>Type</th>
                      <th style={{ padding: 8 }}>Dép.</th>
                      <th style={{ padding: 8 }}>Ville</th>
                      <th style={{ padding: 8 }}>Email</th>
                      <th style={{ padding: 8 }}>Téléphone</th>
                      <th style={{ padding: 8 }}>Site web</th>
                      <th style={{ padding: 8 }}>Statut</th>
                      <th style={{ padding: 8 }}>Source</th>
                      <th style={{ padding: 8 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {venuesData?.venues.map((v) => (
                      <tr key={v._id} style={{ borderBottom: '1px solid var(--ccc-border-subtle)' }}>
                        <td style={{ padding: 8, fontWeight: 600 }}>{v.name}</td>
                        <td style={{ padding: 8 }}>{VENUE_TYPE_OPTIONS.find((t) => t.value === v.type)?.label ?? v.type}</td>
                        <td style={{ padding: 8 }}>{v.address.departement}</td>
                        <td style={{ padding: 8 }}>{v.address.city ?? '—'}</td>
                        <td style={{ padding: 8 }}>{v.email ?? <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        <td style={{ padding: 8 }}>{v.phone ?? <span style={{ color: '#94a3b8' }}>—</span>}</td>
                        <td style={{ padding: 8, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {v.website ? (
                            <a href={v.website.startsWith('http') ? v.website : `https://${v.website}`} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>
                              {v.website.replace(/^https?:\/\//, '')}
                            </a>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: 8 }}>
                          <select
                            value={v.emailStatus}
                            disabled={updatingVenueStatusId === v._id}
                            onChange={(e) => handleVenueStatusChange(v, e.target.value as ProspectedEmailStatus)}
                            style={{
                              padding: '6px 8px',
                              borderRadius: 8,
                              border: '1px solid var(--ccc-border-medium)',
                              background: 'var(--ccc-bg-surface)',
                              color: 'var(--ccc-text-primary)',
                              fontSize: 12,
                              cursor: updatingVenueStatusId === v._id ? 'wait' : 'pointer',
                              minWidth: 120,
                            }}
                            title="Changer le statut email"
                          >
                            {EMAIL_STATUS_OPTIONS.map(({ value, label }) => (
                              <option key={value} value={value}>{label}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: 8, fontSize: 12, color: 'var(--ccc-text-muted)' }}>
                          {SOURCE_LABELS[v.source] ?? v.source}
                        </td>
                        <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => openEditVenueModal(v)}
                            style={{
                              padding: '4px 10px',
                              marginRight: 6,
                              borderRadius: 8,
                              border: '1px solid var(--ccc-border-medium)',
                              background: 'transparent',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteVenue(v)}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 8,
                              border: '1px solid #dc2626',
                              background: 'transparent',
                              color: '#dc2626',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {venuesData && venuesData.pagination.totalPages > 1 && (
                <Pagination
                  page={venuePage}
                  totalPages={venuesData.pagination.totalPages}
                  onChange={setVenuePage}
                />
              )}
            </>
          )}
        </section>

        <ProspectedVenueModal
          open={venueModalOpen}
          venue={editingVenue}
          departments={departments}
          saving={savingVenue}
          onClose={closeVenueModal}
          onSave={handleSaveVenue}
        />
      </main>
    </div>
  );
};

export default ProspectionPage;
