import React, { useState } from 'react';

interface ScorePieChartProps {
  score: number; // 0-100
  size?: number; // Diameter in px
  isLoading?: boolean; // État de chargement
  breakdown?: {
    geographic: number;
    experienceLevel: number;
    experienceYears: number;
  };
  matchReasons?: string[];
}

const ScorePieChart: React.FC<ScorePieChartProps> = ({
  score,
  size = 45,
  isLoading = false,
  breakdown,
  matchReasons
}) => {
  const [showModal, setShowModal] = useState(false);
  // Clamp score between 0 and 100
  const normalizedScore = Math.min(Math.max(score, 0), 100);

  // Determine color based on score
  const getScoreColor = (score: number): string => {
    if (isLoading) return '#9ca3af'; // Gris pendant le chargement
    if (score >= 70) return '#22c55e'; // Green
    if (score >= 40) return 'var(--ccc-warning)'; // Orange
    return 'var(--ccc-error)'; // Red
  };

  const color = getScoreColor(normalizedScore);
  const displayScore = isLoading ? 0 : normalizedScore;

  // Calculate circle parameters
  const strokeWidth = size * 0.15; // 15% of size
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Calculate stroke dash offset for the percentage
  const offset = circumference - (displayScore / 100) * circumference;

  // Background circle color (light gray)
  const backgroundColor = '#e5e7eb';

  // Font size responsive to chart size (smaller for 100% to avoid touching the circle)
  const fontSize = normalizedScore >= 100 ? size * 0.28 : size * 0.30;

  return (
    <>
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (breakdown) {
          setShowModal(true);
        }
      }}
      style={{
        position: 'relative',
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        display: 'inline-block',
        cursor: breakdown ? 'pointer' : 'default',
        flexShrink: 0,
        contain: 'layout style paint',
      }}
    >
      <svg
        width={size}
        height={size}
        style={{
          transform: 'rotate(-90deg)',
          overflow: 'visible',
        }}
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
        />

        {/* Animated progress circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap={displayScore >= 100 ? "butt" : "round"}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.3s ease',
          }}
        />
      </svg>

      {/* Center text with percentage */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          color: color,
          lineHeight: 1,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {isLoading ? '...' : `${Math.round(normalizedScore)}%`}
      </div>
    </div>

    {/* Modal for breakdown details */}
    {showModal && breakdown && (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)',
        }}
        onClick={(e) => {
          e.stopPropagation();
          setShowModal(false);
        }}
      >
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(26, 26, 46, 0.98) 0%, rgba(51, 31, 65, 0.98) 100%)',
            borderRadius: '16px',
            padding: '28px',
            maxWidth: '420px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)',
            maxHeight: '85vh',
            overflowY: 'auto',
            border: '1px solid rgba(124, 58, 237, 0.2)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'var(--ccc-accent-gradient)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px'
              }}>
                🎯
              </div>
              <h3 style={{
                margin: 0,
                fontSize: '20px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '-0.02em'
              }}>
                Compatibilité
              </h3>
            </div>
            <button
              onClick={() => setShowModal(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                width: '32px',
                height: '32px',
                fontSize: '18px',
                cursor: 'pointer',
                color: 'rgba(255, 255, 255, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)';
                e.currentTarget.style.color = 'var(--ccc-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
              }}
            >
              ×
            </button>
          </div>

          {/* Score global highlight */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15) 0%, rgba(255, 75, 43, 0.15) 100%)',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            border: '1px solid rgba(124, 58, 237, 0.25)',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '42px',
              fontWeight: 800,
              background: 'var(--ccc-accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              lineHeight: 1,
              marginBottom: '8px'
            }}>
              {score}%
            </div>
            <div style={{
              fontSize: '13px',
              color: 'rgba(255, 255, 255, 0.5)',
              fontWeight: 500
            }}>
              Score de compatibilité global
            </div>
          </div>

          {/* Breakdown bars */}
          <div style={{ marginBottom: '24px' }}>
            {/* Geographic */}
            <div style={{
              marginBottom: '20px',
              padding: '16px',
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '20px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px'
                  }}>📍</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    Zone de mobilité
                  </span>
                </div>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: breakdown.geographic >= 0.8 ? '#22c55e' : breakdown.geographic >= 0.5 ? 'var(--ccc-warning)' : 'var(--ccc-error)',
                  padding: '4px 12px',
                  backgroundColor: breakdown.geographic >= 0.8 ? 'rgba(34, 197, 94, 0.15)' : breakdown.geographic >= 0.5 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderRadius: '20px'
                }}>
                  {Math.round(breakdown.geographic * 100)}%
                </span>
              </div>
              <div
                style={{
                  height: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '5px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${breakdown.geographic * 100}%`,
                    background: breakdown.geographic >= 0.8
                      ? 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)'
                      : breakdown.geographic >= 0.5
                        ? `linear-gradient(90deg, var(--ccc-warning) 0%, #d97706 100%)`
                        : `linear-gradient(90deg, var(--ccc-error) 0%, #dc2626 100%)`,
                    borderRadius: '5px',
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                  }}
                />
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', margin: '8px 0 0 0' }}>
                Poids: 50% du score total
              </p>
            </div>

            {/* Experience Level */}
            <div style={{
              marginBottom: '20px',
              padding: '16px',
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '20px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px'
                  }}>⭐</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    Nombre de scènes
                  </span>
                </div>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: breakdown.experienceLevel >= 0.8 ? '#22c55e' : breakdown.experienceLevel >= 0.5 ? 'var(--ccc-warning)' : 'var(--ccc-error)',
                  padding: '4px 12px',
                  backgroundColor: breakdown.experienceLevel >= 0.8 ? 'rgba(34, 197, 94, 0.15)' : breakdown.experienceLevel >= 0.5 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderRadius: '20px'
                }}>
                  {Math.round(breakdown.experienceLevel * 100)}%
                </span>
              </div>
              <div
                style={{
                  height: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '5px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${breakdown.experienceLevel * 100}%`,
                    background: breakdown.experienceLevel >= 0.8
                      ? 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)'
                      : breakdown.experienceLevel >= 0.5
                        ? `linear-gradient(90deg, var(--ccc-warning) 0%, #d97706 100%)`
                        : `linear-gradient(90deg, var(--ccc-error) 0%, #dc2626 100%)`,
                    borderRadius: '5px',
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                  }}
                />
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', margin: '8px 0 0 0' }}>
                Poids: 30% du score total
              </p>
            </div>

            {/* Experience Years */}
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(0, 0, 0, 0.25)',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontSize: '20px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px'
                  }}>🎭</span>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    Années d'expérience
                  </span>
                </div>
                <span style={{
                  fontSize: '16px',
                  fontWeight: 700,
                  color: breakdown.experienceYears >= 0.8 ? '#22c55e' : breakdown.experienceYears >= 0.5 ? 'var(--ccc-warning)' : 'var(--ccc-error)',
                  padding: '4px 12px',
                  backgroundColor: breakdown.experienceYears >= 0.8 ? 'rgba(34, 197, 94, 0.15)' : breakdown.experienceYears >= 0.5 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  borderRadius: '20px'
                }}>
                  {Math.round(breakdown.experienceYears * 100)}%
                </span>
              </div>
              <div
                style={{
                  height: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  borderRadius: '5px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${breakdown.experienceYears * 100}%`,
                    background: breakdown.experienceYears >= 0.8
                      ? 'linear-gradient(90deg, #22c55e 0%, #16a34a 100%)'
                      : breakdown.experienceYears >= 0.5
                        ? `linear-gradient(90deg, var(--ccc-warning) 0%, #d97706 100%)`
                        : `linear-gradient(90deg, var(--ccc-error) 0%, #dc2626 100%)`,
                    borderRadius: '5px',
                    transition: 'width 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)',
                  }}
                />
              </div>
              <p style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', margin: '8px 0 0 0' }}>
                Poids: 20% du score total
              </p>
            </div>
          </div>

          {/* Match reasons */}
          {matchReasons && matchReasons.length > 0 && (
            <div style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              paddingTop: '20px',
              marginBottom: '16px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '14px'
              }}>
                <span style={{ fontSize: '16px' }}>✨</span>
                <p style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'rgba(255, 255, 255, 0.5)',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  Points forts
                </p>
              </div>
              <ul style={{
                margin: 0,
                padding: 0,
                listStyle: 'none'
              }}>
                {matchReasons.map((reason, idx) => (
                  <li key={idx} style={{
                    fontSize: '13px',
                    color: 'rgba(255, 255, 255, 0.8)',
                    lineHeight: '1.5',
                    padding: '10px 14px',
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    border: '1px solid rgba(34, 197, 94, 0.15)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px'
                  }}>
                    <span style={{ color: '#22c55e', fontSize: '14px', flexShrink: 0 }}>✓</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={() => setShowModal(false)}
            style={{
              width: '100%',
              padding: '14px 20px',
              borderRadius: '10px',
              border: 'none',
              background: 'var(--ccc-accent-gradient)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)',
              marginTop: '8px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(124, 58, 237, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(124, 58, 237, 0.3)';
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    )}
    </>
  );
};

export default ScorePieChart;
