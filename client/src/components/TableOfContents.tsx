import { type CSSProperties, useState, useEffect } from 'react';

export interface TocSection {
  id: string;
  title: string;
  level: 'h2' | 'h3';
}

interface TableOfContentsProps {
  sections: TocSection[];
  title?: string;
  showOnMobile?: boolean;
}

function TableOfContents({
  sections,
  title = 'Table des matières',
  showOnMobile = true,
}: TableOfContentsProps) {
  const [activeSection, setActiveSection] = useState<string>('');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string>('');

  // Scroll spy using IntersectionObserver
  useEffect(() => {
    const observerOptions = {
      rootMargin: '-100px 0px -66%',
      threshold: 0,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    }, observerOptions);

    sections.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileOpen]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      const navbarHeight = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition =
        elementPosition + window.pageYOffset - navbarHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  const handleSectionClick = (sectionId: string) => {
    scrollToSection(sectionId);
    setIsMobileOpen(false);
  };

  // Desktop sidebar styles
  const sidebarStyle: CSSProperties = {
    position: 'sticky',
    top: '20px',
    alignSelf: 'flex-start',
    width: '260px',
    maxHeight: 'calc(100vh - 40px)',
    overflowY: 'auto',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: '15px',
    padding: '24px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
  };

  const tocTitleStyle: CSSProperties = {
    color: '#FF5A7E',
    fontSize: '1.2em',
    fontWeight: 'bold',
    marginBottom: '20px',
    paddingBottom: '12px',
    borderBottom: '2px solid rgba(255, 90, 126, 0.3)',
  };

  const tocLinkStyle: CSSProperties = {
    display: 'block',
    padding: '10px 12px',
    marginBottom: '8px',
    color: 'rgba(255, 255, 255, 0.75)',
    textDecoration: 'none',
    fontSize: '0.9em',
    borderRadius: '8px',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    borderLeft: '3px solid transparent',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'normal',
    lineHeight: '1.4',
  };

  const tocLinkHoverStyle: CSSProperties = {
    backgroundColor: 'rgba(255, 90, 126, 0.1)',
    color: '#ffffff',
    borderLeftColor: '#FF5A7E',
  };

  const tocLinkActiveStyle: CSSProperties = {
    backgroundColor: 'rgba(255, 90, 126, 0.2)',
    color: '#FF5A7E',
    fontWeight: 'bold',
    borderLeftColor: 'var(--ccc-accent)',
  };

  const tocSubLinkStyle: CSSProperties = {
    ...tocLinkStyle,
    paddingLeft: '24px',
    fontSize: '0.85em',
    opacity: 0.9,
  };

  // Mobile button styles
  const mobileButtonStyle: CSSProperties = {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--ccc-accent), #FF5A7E)',
    border: 'none',
    boxShadow: '0 4px 12px rgba(124, 58, 237, 0.4)',
    color: '#ffffff',
    fontSize: '1.5rem',
    cursor: 'pointer',
    zIndex: 999,
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
  };

  // Mobile drawer styles
  const mobileDrawerOverlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 9998,
  };

  const mobileDrawerStyle: CSSProperties = {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '70vh',
    backgroundColor: 'var(--ccc-bg-elevated)',
    borderTopLeftRadius: '20px',
    borderTopRightRadius: '20px',
    padding: '24px',
    overflowY: 'auto',
    zIndex: 9999,
    boxShadow: '0 -4px 24px rgba(15, 23, 42, 0.12)',
    border: '1px solid var(--ccc-border-subtle)',
  };

  const mobileHeaderStyle: CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  };

  const mobileCloseButtonStyle: CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--ccc-text-primary)',
    fontSize: '1.5rem',
    cursor: 'pointer',
    padding: '0',
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <nav
        id="toc-sidebar"
        style={sidebarStyle}
        role="navigation"
        aria-label="Table des matières"
      >
        <h3 style={tocTitleStyle}>{title}</h3>
        {sections.map((section) => (
          <a
            key={section.id}
            id={`toc-link-${section.id}`}
            onClick={() => handleSectionClick(section.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleSectionClick(section.id);
              }
            }}
            onMouseEnter={() => setHoveredSection(section.id)}
            onMouseLeave={() => setHoveredSection('')}
            tabIndex={0}
            role="button"
            aria-label={`Aller à la section ${section.title}`}
            style={{
              ...tocLinkStyle,
              ...(section.level === 'h3' ? tocSubLinkStyle : {}),
              ...(activeSection === section.id ? tocLinkActiveStyle : {}),
              ...(hoveredSection === section.id ? tocLinkHoverStyle : {}),
            }}
          >
            {section.title}
          </a>
        ))}
      </nav>

      {/* Mobile Floating Button */}
      {showOnMobile && (
        <button
          id="toc-mobile-button"
          onClick={() => setIsMobileOpen(true)}
          style={mobileButtonStyle}
          aria-label="Ouvrir la table des matières"
          aria-expanded={isMobileOpen}
          aria-controls="toc-drawer"
        >
          📋
        </button>
      )}

      {/* Mobile Drawer */}
      {isMobileOpen && showOnMobile && (
        <div>
          <div
            style={mobileDrawerOverlayStyle}
            onClick={() => setIsMobileOpen(false)}
          />
          <div
            id="toc-drawer"
            style={mobileDrawerStyle}
            role="dialog"
            aria-labelledby="toc-drawer-title"
          >
            <div style={mobileHeaderStyle}>
              <h3 id="toc-drawer-title" style={tocTitleStyle}>
                {title}
              </h3>
              <button
                onClick={() => setIsMobileOpen(false)}
                style={mobileCloseButtonStyle}
                aria-label="Fermer la table des matières"
              >
                ✕
              </button>
            </div>
            {sections.map((section) => (
              <a
                key={section.id}
                onClick={() => handleSectionClick(section.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSectionClick(section.id);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-label={`Aller à la section ${section.title}`}
                style={{
                  ...tocLinkStyle,
                  ...(section.level === 'h3' ? tocSubLinkStyle : {}),
                  ...(activeSection === section.id ? tocLinkActiveStyle : {}),
                }}
              >
                {section.title}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (min-width: 1025px) {
          #toc-mobile-button {
            display: none !important;
          }
        }
        @media (max-width: 1024px) {
          #toc-sidebar {
            display: none !important;
          }
          #toc-mobile-button {
            display: flex !important;
          }
        }

        /* Scrollbar styling for TOC sidebar and drawer */
        #toc-sidebar::-webkit-scrollbar,
        #toc-drawer::-webkit-scrollbar {
          width: 6px;
        }

        #toc-sidebar::-webkit-scrollbar-track,
        #toc-drawer::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }

        #toc-sidebar::-webkit-scrollbar-thumb,
        #toc-drawer::-webkit-scrollbar-thumb {
          background: rgba(255, 90, 126, 0.5);
          border-radius: 10px;
        }

        #toc-sidebar::-webkit-scrollbar-thumb:hover,
        #toc-drawer::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 90, 126, 0.8);
        }

        @media (max-width: 374px) {
          #toc-mobile-button {
            bottom: 16px !important;
            right: 16px !important;
            width: 48px !important;
            height: 48px !important;
            font-size: 1.2rem !important;
          }

          #toc-drawer {
            max-height: 60vh !important;
          }
        }

        @media (max-width: 1024px) and (orientation: landscape) {
          #toc-drawer {
            max-height: 50vh !important;
          }
        }
      `}</style>
    </>
  );
}

export default TableOfContents;
