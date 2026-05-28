import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

const LANDING_CSS = `
  .landing-dark { --primary: #FF5A7E; --primary-hover: #E04969; --primary-light: #FFF1F3; --secondary: #00B8D9; --accent: #FFB800; --dark: #1A1D29; --text-primary: #F1F5F9; --text-secondary: rgba(255,255,255,0.75); --bg-light: rgba(255,255,255,0.04); --bg-white: #FFFFFF; --border: rgba(255,255,255,0.12); --shadow-sm: 0 1px 2px rgba(0,0,0,0.2); --shadow-md: 0 4px 6px rgba(0,0,0,0.2); --shadow-lg: 0 10px 15px rgba(0,0,0,0.2); --shadow-xl: 0 20px 25px rgba(0,0,0,0.2); --shadow-2xl: 0 25px 50px rgba(0,0,0,0.3); }
  .landing-dark * { box-sizing: border-box; }
  .landing-dark .container { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
  @keyframes fadeInUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes float { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-20px) rotate(3deg); } }
  @keyframes floatSlow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .landing-dark .animate-in { animation: fadeInUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
  .landing-dark .delay-1 { animation-delay: 0.1s; opacity: 0; } .landing-dark .delay-2 { animation-delay: 0.2s; opacity: 0; } .landing-dark .delay-3 { animation-delay: 0.3s; opacity: 0; } .landing-dark .delay-4 { animation-delay: 0.4s; opacity: 0; }
  .landing-dark header { padding: 16px 0; position: fixed; top: 0; left: 0; right: 0; background: rgba(26, 29, 41, 0.95); backdrop-filter: blur(20px); z-index: 1000; border-bottom: 1px solid var(--border); }
  .landing-dark .header-content { display: flex; justify-content: space-between; align-items: center; }
  .landing-dark .logo { display: flex; align-items: center; justify-content: center; text-decoration: none; cursor: pointer; background: rgba(26, 29, 41, 1); border-radius: 12px; padding: 0; border: none; }
  .landing-dark .logo img { height: 95px; width: auto; display: block; }
  .landing-dark .header-nav { display: flex; gap: 32px; align-items: center; }
  .landing-dark .nav-link { color: var(--text-secondary); text-decoration: none; font-weight: 600; font-size: 15px; transition: color 0.2s; }
  .landing-dark .nav-link:hover { color: var(--primary); }
  .landing-dark .header-buttons { display: flex; gap: 12px; }
  .landing-dark .btn { padding: 12px 24px; border-radius: 12px; border: none; cursor: pointer; font-weight: 600; font-size: 15px; transition: all 0.3s; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; font-family: 'Sora', sans-serif; }
  .landing-dark .btn-primary { background: linear-gradient(135deg, var(--primary), #FF7A92); color: white; box-shadow: 0 4px 12px rgba(255, 90, 126, 0.3); }
  .landing-dark .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(255, 90, 126, 0.4); }
  .landing-dark .btn-secondary { background: transparent; color: var(--text-primary); border: 2px solid var(--border); }
  .landing-dark .btn-secondary:hover { border-color: var(--primary); color: var(--primary); transform: translateY(-2px); }
  .landing-dark .hero { padding: 140px 0 120px; background: transparent; position: relative; overflow: hidden; }
  .landing-dark .hero-content { display: grid; grid-template-columns: 1.2fr 1fr; gap: 80px; align-items: center; position: relative; z-index: 1; }
  .landing-dark .hero-text { max-width: 600px; }
  .landing-dark .hero-badge { display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; background: rgba(255,255,255,0.08); border: 1.5px solid var(--border); border-radius: 100px; font-size: 14px; font-weight: 600; margin-bottom: 24px; color: var(--text-secondary); }
  .landing-dark .hero-badge .dot { width: 8px; height: 8px; background: var(--primary); border-radius: 50%; animation: pulse 2s ease-in-out infinite; }
  .landing-dark .hero h1 { font-size: clamp(2.5rem, 5vw, 68px); font-weight: 800; line-height: 1.1; margin-bottom: 24px; color: var(--text-primary); letter-spacing: -0.03em; font-family: 'Sora', sans-serif; }
  .landing-dark .hero-gradient { background: linear-gradient(135deg, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .landing-dark .hero-subtitle { font-size: clamp(1rem, 2vw, 22px); font-weight: 400; color: var(--text-secondary); margin-bottom: 32px; line-height: 1.6; }
  .landing-dark .hero-ctas { display: flex; gap: 16px; margin-bottom: 0; flex-wrap: wrap; }
  .landing-dark .btn-large { padding: 18px 36px; font-size: 17px; border-radius: 14px; }
  .landing-dark .section-divider { width: 100%; max-width: 1280px; margin: 32px auto 0; padding: 0 24px; box-sizing: border-box; border: none; border-top: 1px solid rgba(255,255,255,0.12); height: 0; }
  .landing-dark .section-divider.hero-divider { margin-top: 32px; margin-bottom: 0; }
  .landing-dark .section-divider.after-section { margin-top: 48px; }
  .landing-dark .hero-stats { display: flex; gap: 40px; padding-top: 32px; flex-wrap: wrap; }
  .landing-dark .stat-number { font-size: 32px; font-weight: 800; color: var(--primary); line-height: 1; }
  .landing-dark .stat-label { font-size: 14px; color: var(--text-secondary); margin-top: 4px; }
  .landing-dark .hero-visual { position: relative; display: flex; align-items: center; justify-content: center; }
  .landing-dark .profile-cards { position: relative; width: 100%; height: 500px; }
  .landing-dark .profile-card { position: absolute; background: white; border-radius: 24px; padding: 24px; box-shadow: var(--shadow-2xl); border: 1px solid var(--border); transition: transform 0.3s; color: #1a1a1a; }
  .landing-dark .profile-card:hover { transform: translateY(-10px) !important; }
  .landing-dark .profile-card-1 { top: 20px; left: 0; width: 280px; z-index: 3; animation: floatSlow 6s ease-in-out infinite; }
  .landing-dark .profile-card-2 { top: 180px; right: 40px; width: 260px; z-index: 2; animation: floatSlow 8s ease-in-out infinite; animation-delay: 1s; }
  .landing-dark .profile-card-3 { bottom: 40px; left: 80px; width: 240px; z-index: 1; animation: floatSlow 7s ease-in-out infinite; animation-delay: 0.5s; }
  .landing-dark .card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .landing-dark .avatar { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, var(--primary), var(--secondary)); display: flex; align-items: center; justify-content: center; font-size: 24px; }
  .landing-dark .card-info h4 { font-size: 16px; font-weight: 700; color: #1a1a1a; }
  .landing-dark .card-info p { font-size: 13px; color: #64748B; }
  .landing-dark .card-badge { display: inline-block; padding: 4px 10px; background: var(--primary-light); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; margin-bottom: 12px; }
  .landing-dark .card-details { font-size: 14px; color: #64748B; line-height: 1.6; }
  .landing-dark .floating-emoji { position: absolute; font-size: 48px; animation: float 4s ease-in-out infinite; }
  .landing-dark .emoji-1 { top: 60px; right: -40px; } .landing-dark .emoji-2 { bottom: 100px; right: -20px; animation-delay: 1s; } .landing-dark .emoji-3 { top: 200px; left: -30px; animation-delay: 0.5s; }
  .landing-dark .role-cards-section { padding: 100px 0; background: transparent; }
  .landing-dark .section-header { text-align: center; max-width: 800px; margin: 0 auto 80px; }
  .landing-dark .section-badge { display: inline-block; padding: 10px 20px; background: rgba(255,255,255,0.08); border: 1.5px solid var(--border); border-radius: 100px; font-size: 18px; font-weight: 700; margin-bottom: 20px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--primary); }
  .landing-dark .section-title { font-size: clamp(2rem, 4vw, 52px); font-weight: 800; margin-bottom: 20px; letter-spacing: -0.02em; color: var(--text-primary); line-height: 1.1; font-family: 'Sora', sans-serif; }
  .landing-dark .section-description { font-size: 20px; color: var(--text-secondary); line-height: 1.7; }
  .landing-dark .role-cards { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 60px; }
  .landing-dark .role-card { background: white; border: 2px solid var(--border); border-radius: 24px; padding: 40px; cursor: pointer; transition: all 0.4s; position: relative; overflow: hidden; color: #1a1a1a; }
  .landing-dark .role-card:hover { transform: translateY(-12px); box-shadow: var(--shadow-2xl); border-color: var(--primary); }
  .landing-dark .role-icon { width: 80px; height: 80px; background: linear-gradient(135deg, var(--primary-light), #FFE8EC); border-radius: 20px; display: flex; align-items: center; justify-content: center; font-size: 40px; margin-bottom: 24px; }
  .landing-dark .role-card h3 { font-size: 24px; font-weight: 700; margin-bottom: 16px; color: #1a1a1a; }
  .landing-dark .role-features { list-style: none; padding: 0; margin: 0; }
  .landing-dark .role-features li { padding: 10px 0; padding-left: 28px; position: relative; color: #64748B; font-size: 15px; line-height: 1.6; }
  .landing-dark .role-features li::before { content: '✓'; position: absolute; left: 0; color: var(--primary); font-weight: bold; font-size: 16px; }
  .landing-dark .role-cta { margin-top: 24px; padding: 12px 24px; background: transparent; border: 2px solid var(--primary); color: var(--primary); border-radius: 12px; font-weight: 600; cursor: pointer; transition: all 0.3s; width: 100%; font-family: 'Sora', sans-serif; }
  .landing-dark .role-cta:hover { background: var(--primary); color: white; }
  .landing-dark .problem-section { padding: 140px 0; background: transparent; position: relative; overflow: hidden; }
  .landing-dark .problem-comparison { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; max-width: 1200px; margin: 0 auto; position: relative; z-index: 2; }
  .landing-dark .comparison-side { background: white; border-radius: 24px; padding: 48px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); position: relative; overflow: hidden; transition: transform 0.3s ease; color: #1a1a1a; }
  .landing-dark .comparison-side:hover { transform: translateY(-8px); }
  .landing-dark .before-side { border: 2px solid #FFE5EB; }
  .landing-dark .before-side::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #FF5A7E, #FF7A92); }
  .landing-dark .after-side { border: 2px solid #D4F4DD; }
  .landing-dark .after-side::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px; background: linear-gradient(90deg, #10B981, #34D399); }
  .landing-dark .comparison-header { display: flex; align-items: center; gap: 16px; margin-bottom: 32px; }
  .landing-dark .comparison-icon { width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px; flex-shrink: 0; }
  .landing-dark .before-side .comparison-icon { background: linear-gradient(135deg, #FFE5EB, #FFF1F3); }
  .landing-dark .after-side .comparison-icon { background: linear-gradient(135deg, #D4F4DD, #E7F9ED); }
  .landing-dark .comparison-title { flex: 1; }
  .landing-dark .comparison-label { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 4px; }
  .landing-dark .before-side .comparison-label { color: #FF5A7E; }
  .landing-dark .after-side .comparison-label { color: #10B981; }
  .landing-dark .comparison-heading { font-size: 28px; font-weight: 800; color: #0F172A; line-height: 1.2; }
  .landing-dark .comparison-items { display: flex; flex-direction: column; gap: 16px; }
  .landing-dark .comparison-item { padding: 20px; border-radius: 12px; display: flex; align-items: flex-start; gap: 16px; transition: all 0.3s ease; }
  .landing-dark .before-side .comparison-item { background: #FFF9FA; border: 1.5px solid #FFE5EB; }
  .landing-dark .after-side .comparison-item { background: #F7FEF9; border: 1.5px solid #D4F4DD; }
  .landing-dark .comparison-item:hover { transform: translateX(8px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  .landing-dark .item-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; }
  .landing-dark .before-side .item-icon { background: white; border: 2px solid #FFE5EB; }
  .landing-dark .after-side .item-icon { background: white; border: 2px solid #D4F4DD; }
  .landing-dark .item-content h4 { font-size: 16px; font-weight: 700; color: #0F172A; margin-bottom: 4px; }
  .landing-dark .item-content p { font-size: 14px; color: #64748B; line-height: 1.5; }
  .landing-dark .comparison-divider { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 10; display: flex; align-items: center; justify-content: center; }
  .landing-dark .divider-arrow { width: 80px; height: 80px; background: linear-gradient(135deg, var(--primary), #FF7A92); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 36px; font-weight: bold; box-shadow: 0 8px 32px rgba(255, 90, 126, 0.4); border: 4px solid white; }
  @keyframes glowPulse { 0%, 100% { box-shadow: 0 0 20px rgba(255, 90, 126, 0.3), 0 0 40px rgba(255, 90, 126, 0.1); } 50% { box-shadow: 0 0 30px rgba(255, 90, 126, 0.5), 0 0 60px rgba(255, 90, 126, 0.2); } }
  .landing-dark .divider-arrow { animation: glowPulse 2s ease-in-out infinite; }
  .landing-dark .problem-conclusion-new { margin-top: 60px; text-align: center; position: relative; z-index: 2; }
  .landing-dark .conclusion-card { max-width: 700px; margin: 0 auto; padding: 40px; background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); border: 2px solid var(--primary); position: relative; overflow: hidden; color: #1a1a1a; }
  .landing-dark .conclusion-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 8px; background: linear-gradient(90deg, var(--primary), var(--secondary), var(--accent)); }
  .landing-dark .conclusion-icon { width: 64px; height: 64px; margin: 0 auto 20px; background: linear-gradient(135deg, var(--primary-light), white); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; }
  .landing-dark .conclusion-text { font-size: 24px; font-weight: 700; color: #0F172A; margin-bottom: 12px; line-height: 1.4; }
  .landing-dark .conclusion-subtext { font-size: 16px; color: #64748B; line-height: 1.6; }
  @media (max-width: 968px) { .landing-dark .problem-comparison { grid-template-columns: 1fr; gap: 60px; } .landing-dark .comparison-divider { transform: translate(-50%, -50%) rotate(90deg); } .landing-dark .comparison-side { padding: 32px; } }
  @media (max-width: 640px) { .landing-dark .comparison-heading { font-size: 24px; } .landing-dark .comparison-side { padding: 24px; } .landing-dark .conclusion-text { font-size: 20px; } }
  .landing-dark .how-section { padding: 120px 0; background: transparent; }
  .landing-dark .steps-timeline { position: relative; margin-top: 80px; }
  .landing-dark .steps-line { position: absolute; top: 50px; left: 10%; right: 10%; height: 3px; background: linear-gradient(90deg, var(--primary), var(--secondary)); border-radius: 2px; z-index: 0; }
  .landing-dark .steps-container { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; position: relative; z-index: 1; }
  .landing-dark .step { background: white; border: 2px solid var(--border); border-radius: 24px; padding: 48px 32px; text-align: center; position: relative; transition: all 0.4s; color: #1a1a1a; }
  .landing-dark .step:hover { transform: translateY(-12px); border-color: var(--primary); box-shadow: var(--shadow-2xl); }
  .landing-dark .step-number { width: 72px; height: 72px; background: linear-gradient(135deg, var(--primary), var(--secondary)); border-radius: 18px; display: flex; align-items: center; justify-content: center; margin: 0 auto 28px; font-weight: 800; font-size: 32px; color: white; box-shadow: 0 8px 24px rgba(255, 90, 126, 0.3); }
  .landing-dark .step-icon { font-size: 48px; margin-bottom: 20px; }
  .landing-dark .step h3 { font-size: 22px; font-weight: 700; margin-bottom: 16px; color: #1a1a1a; }
  .landing-dark .step p { color: #64748B; font-size: 16px; line-height: 1.7; }
  .landing-dark .steps-conclusion { text-align: center; font-size: 24px; font-weight: 700; color: var(--primary); margin-top: 60px; padding: 32px; background: rgba(255,255,255,0.06); border-radius: 20px; border: 2px solid var(--primary); }
  .landing-dark .tutorial-links { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 60px; position: relative; z-index: 1; max-width: 800px; margin-left: auto; margin-right: auto; }
  .landing-dark .tutorial-link-card { display: block; background: white; border: 2px solid var(--border); border-top: none; border-radius: 24px; overflow: hidden; text-align: center; transition: all 0.4s; color: #1a1a1a; text-decoration: none; padding: 0; margin: 0; font: inherit; }
  .landing-dark .tutorial-link-card:hover { transform: translateY(-8px); border-color: var(--primary); box-shadow: var(--shadow-2xl); color: #1a1a1a; }
  .landing-dark .tutorial-thumbnail-wrap { position: relative; width: 100%; aspect-ratio: 16/9; background: #0f172a; overflow: hidden; }
  .landing-dark .tutorial-thumbnail-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .landing-dark .tutorial-link-card h3 { font-size: 16px; font-weight: 700; margin: 0; padding: 20px 16px; color: #1a1a1a; line-height: 1.3; }
  .landing-dark .tutorial-link-card { cursor: pointer; }
  .landing-dark .video-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 2000; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box; }
  .landing-dark .video-modal-box { position: relative; width: 100%; max-width: 900px; aspect-ratio: 16/9; background: #000; border-radius: 16px; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.5); }
  .landing-dark .video-modal-box iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; }
  .landing-dark .video-modal-close { position: absolute; top: -44px; right: 0; width: 40px; height: 40px; border: none; background: rgba(255,255,255,0.2); color: white; font-size: 24px; cursor: pointer; border-radius: 8px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
  .landing-dark .video-modal-close:hover { background: rgba(255,255,255,0.35); }
  @media (max-width: 968px) { .landing-dark .tutorial-links { grid-template-columns: 1fr; } }
  .landing-dark .features-section { padding: 120px 0; background: transparent; }
  .landing-dark .features-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 80px; }
  .landing-dark .feature-card { background: rgba(255,255,255,0.06); border-radius: 24px; padding: 48px; border: 2px solid var(--border); transition: all 0.4s; }
  .landing-dark .feature-card:hover { background: white; border-color: var(--primary); box-shadow: var(--shadow-xl); color: #1a1a1a; }
  .landing-dark .feature-icon { width: 64px; height: 64px; background: linear-gradient(135deg, var(--primary), var(--secondary)); border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px; margin-bottom: 24px; }
  .landing-dark .feature-card h3 { font-size: 24px; font-weight: 700; margin-bottom: 12px; color: var(--text-primary); }
  .landing-dark .feature-card:hover h3 { color: #1a1a1a; }
  .landing-dark .feature-card p { color: var(--text-secondary); font-size: 16px; line-height: 1.7; }
  .landing-dark .feature-card:hover p { color: #64748B; }
  .landing-dark .cta-section { padding: 120px 0; background: transparent; }
  .landing-dark .cta-content { max-width: 800px; margin: 0 auto; text-align: center; }
  .landing-dark .cta-content h2 { font-size: clamp(2rem, 4vw, 56px); font-weight: 800; margin-bottom: 24px; letter-spacing: -0.02em; color: var(--text-primary); line-height: 1.1; font-family: 'Sora', sans-serif; }
  .landing-dark .cta-content p { font-size: 22px; color: var(--text-secondary); margin-bottom: 48px; line-height: 1.6; }
  .landing-dark .cta-buttons { display: flex; gap: 20px; justify-content: center; flex-wrap: wrap; }
  .landing-dark footer { background: rgba(0,0,0,0.3); color: white; padding: 80px 0 40px; border-top: 1px solid var(--border); }
  .landing-dark .footer-content { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr; gap: 40px; margin-bottom: 60px; }
  .landing-dark .footer-brand p { color: rgba(255, 255, 255, 0.7); font-size: 15px; line-height: 1.7; }
  .landing-dark .footer-links h4 { font-size: 14px; font-weight: 700; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--primary); }
  .landing-dark .footer-links ul { list-style: none; padding: 0; margin: 0; }
  .landing-dark .footer-links li { margin-bottom: 14px; }
  .landing-dark .footer-links a { color: rgba(255, 255, 255, 0.7); text-decoration: none; font-size: 15px; transition: color 0.2s; }
  .landing-dark .footer-links a:hover { color: white; }
  .landing-dark .footer-links button.footer-link-btn { color: rgba(255, 255, 255, 0.7); font-size: 15px; background: none; border: none; cursor: pointer; padding: 0; text-align: left; font-family: inherit; transition: color 0.2s; }
  .landing-dark .footer-links button.footer-link-btn:hover { color: white; }
  .landing-dark .footer-bottom { text-align: center; padding-top: 40px; border-top: 1px solid rgba(255,255,255,0.1); }
  .landing-dark .footer-bottom p { color: rgba(255, 255, 255, 0.5); font-size: 14px; }
  @media (max-width: 968px) { .landing-dark .hero-content { grid-template-columns: 1fr; text-align: center; } .landing-dark .hero-text { max-width: 100%; } .landing-dark .hero-visual { display: none; } .landing-dark .role-cards, .landing-dark .steps-container, .landing-dark .features-grid, .landing-dark .footer-content { grid-template-columns: 1fr; } .landing-dark .header-nav { display: none; } .landing-dark .steps-line { display: none; } }
  @media (max-width: 640px) { .landing-dark .hero-ctas { flex-direction: column; } .landing-dark .hero-stats { flex-direction: column; gap: 20px; } }
`;

const YOUTUBE_TUTORIAL_ORGANISATEUR = ''; // À remplir : lien YouTube "tutoriel s'inscrire en tant qu'organisateur"
const YOUTUBE_TUTORIAL_HUMORISTE = '';   // À remplir : lien YouTube "tutoriel s'inscrire en tant qu'humoriste"

function getYoutubeVideoId(url: string): string | null {
  if (!url || url === '#') return null;
  const trimmed = url.trim();
  const match = trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : (trimmed.length === 11 ? trimmed : null);
}

function youtubeThumbnailUrl(videoId: string | null): string | null {
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function LandingPage() {
  const navigate = useNavigate();
  const [videoModalId, setVideoModalId] = useState<string | null>(null);

  useEffect(() => {
    if (!videoModalId) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') setVideoModalId(null); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [videoModalId]);

  // Scroll vers "Choisissez votre profil" quand on arrive avec #roles (ex: lien "Inscris-toi" depuis la page login)
  useEffect(() => {
    if (window.location.hash !== '#roles') return;
    const t = setTimeout(() => {
      const section = document.getElementById('roles');
      if (!section) return;
      const cards = section.querySelector('.role-cards');
      const target = cards || section;
      const headerOffset = 80;
      const y = target.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }, 100);
    return () => clearTimeout(t);
  }, []);

  const goRegister = () => navigate('/register');
  const scrollToRoles = () => {
    const section = document.getElementById('roles');
    if (!section) return;
    const cards = section.querySelector('.role-cards');
    const target = cards || section;
    const headerOffset = 80;
    const y = target.getBoundingClientRect().top + window.scrollY - headerOffset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };
  const goLogin = () => navigate('/login');
  const goOrganisateur = () => navigate('/organisateur');
  const goRegisterOrganisateur = () => navigate('/register/organisateur');
  const goRegisterHumoriste = () => navigate('/register');
  const goCalendar = () => navigate('/calendar');
  const goRegisterSpectateur = () => navigate('/register/spectateur');
  const goRegisterLieu = () => navigate('/register/lieu');

  return (
    <div
      className="landing-dark"
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 40%, #331f41 100%)',
        fontFamily: "'Sora', -apple-system, BlinkMacSystemFont, sans-serif",
        color: '#F1F5F9',
        lineHeight: 1.6,
        scrollBehavior: 'smooth',
      }}
    >
      <style>{LANDING_CSS}</style>

      <header>
        <div className="container">
          <div className="header-content">
            <button type="button" className="logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Accueil">
              <img src="/logo-connect-comedy-club.png" alt="Connect Comedy Club" />
            </button>
            <nav className="header-nav">
              <a href="#fonctionnement" className="nav-link">Comment ça marche</a>
              <a href="#roles" className="nav-link">Pour qui</a>
              <a href="#avantages" className="nav-link">Avantages </a>
              <Link to="/a-propos" className="nav-link">À propos</Link>
            </nav>
            <div className="header-buttons">
              <Link to="/login?redirect=/aides" className="btn btn-primary">Dispositif de financement</Link>
              <button type="button" className="btn btn-secondary" onClick={goLogin}>Se connecter</button>
              <button type="button" className="btn btn-primary" onClick={scrollToRoles}>S'inscrire</button>
            </div>
          </div>
        </div>
      </header>

      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <div className="hero-badge animate-in">
                <span className="dot" />
                Nouvelle plateforme pour le stand-up
              </div>
              <h1 className="animate-in delay-1">
                L'app qui connecte<br />
                <span className="hero-gradient">humoristes, scènes<br />et public</span>
              </h1>
              <p className="hero-subtitle animate-in delay-2">
                Créez un plateau. Candidatez. Découvrez.<br />
                Tout le stand-up, au même endroit.
              </p>
              <div className="hero-ctas animate-in delay-3">
                <button type="button" className="btn btn-primary btn-large" onClick={scrollToRoles}>Créer mon compte</button>
              </div>
              <div className="section-divider hero-divider" aria-hidden />
              {/* <div className="hero-stats animate-in delay-4">
                <div className="stat">
                  <div className="stat-number">500+</div>
                  <div className="stat-label">Humoristes</div>
                </div>
                <div className="stat">
                  <div className="stat-number">200+</div>
                  <div className="stat-label">Plateaux créés</div>
                </div>
                <div className="stat">
                  <div className="stat-number">50+</div>
                  <div className="stat-label">Scènes partenaires</div>
                </div>
              </div> */}
            </div>
            <div className="hero-visual animate-in delay-2">
              <div className="profile-cards">
                <div className="profile-card profile-card-1">
                  <div className="card-header">
                    <div className="avatar">🎤</div>
                    <div className="card-info">
                      <h4>Le Comedy Lab</h4>
                      <p>Organisateur · Paris</p>
                    </div>
                  </div>
                  <div className="card-badge">Plateau ce soir</div>
                  <div className="card-details">Recherche 5 humoristes · 20h30 </div>
                </div>
                <div className="profile-card profile-card-2">
                  <div className="card-header">
                    <div className="avatar">🎭</div>
                    <div className="card-info">
                      <h4>Marie Dupont</h4>
                      <p>Humoriste</p>
                    </div>
                  </div>
                  <div className="card-badge">Candidature envoyée</div>
                  <div className="card-details">4 plateaux ce mois-ci · 6 candidatures en attente</div>
                </div>
                <div className="profile-card profile-card-3">
                  <div className="card-header">
                    <div className="avatar">👀</div>
                    <div className="card-info">
                      <h4>Thomas Martin</h4>
                      <p>Spectateur</p>
                    </div>
                  </div>
                  <div className="card-badge">5 spectacles à venir</div>
                  <div className="card-details">Suit 8 scènes · Notifications activées</div>
                </div>
                <div className="floating-emoji emoji-1">🎪</div>
                <div className="floating-emoji emoji-2">🔥</div>
                <div className="floating-emoji emoji-3">⭐</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="role-cards-section" id="roles">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">POUR QUI</span>
            <h2 className="section-title">Choisissez votre profil</h2>
            <p className="section-description">Des fonctionnalités sur mesure pour chaque acteur du stand-up</p>
          </div>
          <div className="role-cards">
            <div className="role-card">
              <div className="role-icon">🎤</div>
              <h3>Organisateurs</h3>
              <ul className="role-features">
                <li>Créer un plateau en 2 minutes</li>
                <li>Centraliser les candidatures</li>
                <li>Notifier automatiquement</li>
                <li>Gérer plusieurs événements</li>
              </ul>
              <button type="button" className="role-cta" onClick={goRegisterOrganisateur}>S'inscrire →</button>
            </div>
            <div className="role-card">
              <div className="role-icon">🎭</div>
              <h3>Humoristes</h3>
              <ul className="role-features">
                <li>Notifications en temps réel</li>
                <li>Postuler en un clic</li>
                <li>Suivre vos candidatures</li>
                <li>Créer votre profil scène</li>
              </ul>
              <button type="button" className="role-cta" onClick={goRegisterHumoriste}>S'inscrire →</button>
            </div>
            <div className="role-card">
              <div className="role-icon">👥</div>
              <h3>Spectateurs</h3>
              <ul className="role-features">
                <li>Découvrir les plateaux</li>
                <li>Suivre vos scènes favorites</li>
                <li>Réserver vos places</li>
                <li>Ne rien manquer</li>
              </ul>
              <button type="button" className="role-cta" onClick={goRegisterSpectateur}>S'inscrire →</button>
            </div>
            <div className="role-card">
              <div className="role-icon">🏛️</div>
              <h3>Lieux</h3>
              <ul className="role-features">
                <li>Référencer votre salle</li>
                <li>Gérer vos réservations</li>
                <li>Mettre en avant vos espaces</li>
                <li>Simplifier la location</li>
              </ul>
              <button type="button" className="role-cta" onClick={goRegisterLieu}>S'inscrire →</button>
            </div>
          </div>
        </div>
      </section>
      <div className="section-divider after-section" aria-hidden />

      <section className="problem-section">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">LE CONSTAT</span>
            <h2 className="section-title">Le stand-up ne devrait pas
            se gérer en DM<br /></h2>
            {/* <p className="section-description">Découvrez comment nous transformons la gestion des plateaux</p> */}
          </div>

          <div className="problem-comparison">
            <div className="comparison-side before-side">
              <div className="comparison-header">
                <div className="comparison-icon">😵</div>
                <div className="comparison-title">
                  <div className="comparison-label">Avant</div>
                  <h3 className="comparison-heading">Le chaos quotidien</h3>
                </div>
              </div>
              <div className="comparison-items">
                <div className="comparison-item">
                  <div className="item-icon">💬</div>
                  <div className="item-content">
                    <h4>Messages dispersés</h4>
                    <p>WhatsApp, Instagram, SMS... Impossible de suivre toutes les conversations</p>
                  </div>
                </div>
                <div className="comparison-item">
                  <div className="item-icon">❌</div>
                  <div className="item-content">
                    <h4>Candidatures perdues</h4>
                    <p>Des DM oubliés, des humoristes qui ne répondent pas, une vraie galère</p>
                  </div>
                </div>
                <div className="comparison-item">
                  <div className="item-icon">📱</div>
                  <div className="item-content">
                    <h4>Groupes qui s'empilent</h4>
                    <p>Un nouveau groupe WhatsApp pour chaque plateau, c'est ingérable</p>
                  </div>
                </div>
                <div className="comparison-item">
                  <div className="item-icon">🔄</div>
                  <div className="item-content">
                    <h4>Infos qui changent</h4>
                    <p>Modifications de dernière minute perdues dans le flux de messages</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="comparison-side after-side">
              <div className="comparison-header">
                <div className="comparison-icon">✨</div>
                <div className="comparison-title">
                  <div className="comparison-label">Avec Connect Comedy Club</div>
                  <h3 className="comparison-heading">L'organisation fluide</h3>
                </div>
              </div>
              <div className="comparison-items">
                <div className="comparison-item">
                  <div className="item-icon">🎯</div>
                  <div className="item-content">
                    <h4>Tout centralisé</h4>
                    <p>Une seule plateforme pour gérer tous vos événements et candidatures</p>
                  </div>
                </div>
                <div className="comparison-item">
                  <div className="item-icon">✅</div>
                  <div className="item-content">
                    <h4>Suivi automatique</h4>
                    <p>Notifications instantanées et historique complet de chaque plateau</p>
                  </div>
                </div>
                <div className="comparison-item">
                  <div className="item-icon">👥</div>
                  <div className="item-content">
                    <h4>Communication claire</h4>
                    <p>Échanges structurés et transparents entre organisateurs et artistes</p>
                  </div>
                </div>
                <div className="comparison-item">
                  <div className="item-icon">⚡</div>
                  <div className="item-content">
                    <h4>Mises à jour en temps réel</h4>
                    <p>Tous les participants informés instantanément de chaque changement</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="comparison-divider">
              <div className="divider-arrow">→</div>
            </div>
          </div>

          <div className="problem-conclusion-new">
            <div className="conclusion-card">
              <div className="conclusion-icon">🚀</div>
              <div className="conclusion-text">Simplifiez tout et gagnez en clarté en quelques clics</div>
              <p>Rejoignez les centaines d'organisateurs et d'humoristes qui ont déjà simplifié leur quotidien avec Connect Comedy Club</p>
            </div>
          </div>
        </div>
      </section>
      <div className="section-divider after-section" aria-hidden />

      <section className="how-section" id="fonctionnement">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">COMMENT ÇA MARCHE</span>
            <h2 className="section-title">Simple, rapide, efficace</h2>
            <p className="section-description">Moins de messages. Plus de clarté. Une programmation fluide.</p>
          </div>
          <div className="steps-timeline">
            <div className="steps-line" />
            <div className="steps-container">
              <div className="step">
                <div className="step-number">1</div>
                <div className="step-icon">📅</div>
                <h3>Créer l'événement</h3>
                <p>Définissez la date, le lieu et le nombre d'humoristes recherchés en quelques clics</p>
              </div>
              <div className="step">
                <div className="step-number">2</div>
                <div className="step-icon">🔔</div>
                <h3>Notifier & Recevoir</h3>
                <p>Les humoristes reçoivent une notification et postulent directement via la plateforme</p>
              </div>
              <div className="step">
                <div className="step-number">3</div>
                <div className="step-icon">✅</div>
                <h3>Valider le plateau</h3>
                <p>Sélectionnez les humoristes et confirmez-les automatiquement</p>
              </div>
            </div>
            <div className="tutorial-links">
              {(() => {
                const urlOrg = YOUTUBE_TUTORIAL_ORGANISATEUR || 'https://youtu.be/tmj67H38i8s';
                const videoIdOrg = getYoutubeVideoId(urlOrg);
                const thumbOrg = videoIdOrg ? youtubeThumbnailUrl(videoIdOrg) : null;
                return (
                  <button
                    type="button"
                    className="tutorial-link-card"
                    onClick={() => videoIdOrg && setVideoModalId(videoIdOrg)}
                    aria-label="Voir le tutoriel d'utilisation en tant qu'Organisateur"
                  >
                    <div className="tutorial-thumbnail-wrap">
                      {thumbOrg ? (
                        <img src={thumbOrg} alt="" loading="lazy" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 48 }}>▶</div>
                      )}
                    </div>
                    <h3>🎥 Tutoriel d'utilisastion de l'application en tant qu'Organisateur</h3>
                  </button>
                );
              })()}
              {(() => {
                const urlHum = YOUTUBE_TUTORIAL_HUMORISTE || 'https://youtu.be/AxD32X-VnBc';
                const videoIdHum = getYoutubeVideoId(urlHum);
                const thumbHum = videoIdHum ? youtubeThumbnailUrl(videoIdHum) : null;
                return (
                  <button
                    type="button"
                    className="tutorial-link-card"
                    onClick={() => videoIdHum && setVideoModalId(videoIdHum)}
                    aria-label="Voir le tutoriel d'utilisation en tant qu'Humoriste"
                  >
                    <div className="tutorial-thumbnail-wrap">
                      {thumbHum ? (
                        <img src={thumbHum} alt="" loading="lazy" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 48 }}>▶</div>
                      )}
                    </div>
                    <h3>🎥 Tutoriel d'utilisastion de l'application en tant qu'Humoriste</h3>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      </section>
      <div className="section-divider after-section" aria-hidden />

      <section className="features-section" id="avantages">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">AVANTAGES</span>
            <h2 className="section-title">Tout ce dont vous avez besoin</h2>
            <p className="section-description">Des fonctionnalités pensées pour rendre l'organisation du stand-up plus simple</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Gestion centralisée</h3>
              <p>Toutes vos candidatures au même endroit. Fini les messages dispersés sur plusieurs plateformes.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔔</div>
              <h3>Notifications temps réel</h3>
              <p>Soyez alerté instantanément des nouveaux plateaux, candidatures et confirmations.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Sélection flexible</h3>
              <p>Choisissez vos humoristes facilement avec notre interface intuitive de sélection.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">👤</div>
              <h3>Profils dédiés</h3>
              <p>Chaque utilisateur a un profil adapté à son rôle : organisateur, humoriste ou spectateur.</p>
            </div>
          </div>
        </div>
      </section>
      <div className="section-divider after-section" aria-hidden />

      <section className="cta-section">
        <div className="container">
          <div className="cta-content">
            <h2>Rejoignez l'écosystème<br />stand-up</h2>
            <p>Créez votre compte gratuitement et commencez dès aujourd'hui à simplifier votre organisation</p>
            <div className="cta-buttons">
              <button type="button" className="btn btn-primary btn-large" onClick={scrollToRoles}>Créer mon compte</button>
            </div>
          </div>
        </div>
      </section>

      <footer>
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <img src="/logo-connect-comedy-club.png" alt="Connect Comedy Club" style={{ height: '95px', width: 'auto' }} loading="lazy" />
              <p>La plateforme qui connecte humoristes, scènes et public pour simplifier l'organisation du stand-up.</p>
              <p>Contact: contact@connectcomedyclub.com</p>
            </div>
            <div className="footer-links">
              <h4>Produit</h4>
              <ul>
                <li><a href="#avantages">Fonctionnalités</a></li>
                <li><a href="#fonctionnement">Comment ça marche</a></li>
              </ul>
            </div>
            <div className="footer-links">
              <h4>Accès</h4>
              <ul>
                <li><button type="button" className="footer-link-btn" onClick={goLogin}>Se connecter</button></li>
                <li><button type="button" className="footer-link-btn" onClick={scrollToRoles}>S'inscrire</button></li>
              </ul>
            </div>
            <div className="footer-links">
              <h4>Rôles</h4>
              <ul>
                <li><button type="button" className="footer-link-btn" onClick={goOrganisateur}>Organisateur</button></li>
                <li><button type="button" className="footer-link-btn" onClick={goLogin}>Humoriste</button></li>
                <li><button type="button" className="footer-link-btn" onClick={goCalendar}>Spectateur</button></li>
                <li><button type="button" className="footer-link-btn" onClick={goRegisterLieu}>Lieux</button></li>
              </ul>
            </div>
            <div className="footer-links">
              <h4>Légal</h4>
              <ul>
                <li><Link to="/mentions-legales" className="footer-link-btn">Mentions légales</Link></li>
                <li><Link to="/politique-confidentialite" className="footer-link-btn">Confidentialité</Link></li>
                <li><Link to="/cgu" className="footer-link-btn">CGU</Link></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 Connect Comedy Club. Tous droits réservés.</p>
          </div>
        </div>
      </footer>

      {videoModalId && (
        <div
          className="video-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Lecteur vidéo"
          onClick={() => setVideoModalId(null)}
        >
          <div className="video-modal-box" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="video-modal-close"
              onClick={() => setVideoModalId(null)}
              aria-label="Fermer la vidéo"
            >
              ×
            </button>
            <iframe
              title="Tutoriel vidéo"
              src={`https://www.youtube.com/embed/${videoModalId}?autoplay=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default LandingPage;
