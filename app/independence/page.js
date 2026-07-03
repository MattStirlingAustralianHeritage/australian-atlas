import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { breadcrumbJsonLd } from '@/lib/jsonLd'

export async function generateMetadata() {
  const locale = await getLocale()
  const isKo = locale === 'ko'
  if (isKo) {
    return {
      title: '독립성 서약 | Australian Atlas',
      description: 'Australian Atlas에서 "독립"이 무엇을 의미하는지, 왜 중요한지, 그리고 네트워크의 모든 등록처를 어떻게 검증하는지 알아보세요.',
      openGraph: {
        title: '독립성 서약 | Australian Atlas',
        description: 'Australian Atlas의 모든 장소는 독립적으로 소유되고 운영됩니다. 체인 없음. 프랜차이즈 없음. 기업 그룹 없음.',
      },
    }
  }
  return {
    title: 'The Independence Pledge | Australian Atlas',
    description: 'What "independent" means on Australian Atlas, why it matters, and how we verify every listing in the network.',
    openGraph: {
      title: 'The Independence Pledge | Australian Atlas',
      description: 'Every place on Australian Atlas is independently owned and operated. No chains. No franchises. No corporate groups.',
    },
  }
}

export default async function IndependencePage() {
  const t = await getTranslations('explore')
  const criteria = [
    { title: t('indepCriteria1Title'), desc: t('indepCriteria1Desc') },
    { title: t('indepCriteria2Title'), desc: t('indepCriteria2Desc') },
    { title: t('indepCriteria3Title'), desc: t('indepCriteria3Desc') },
    { title: t('indepCriteria4Title'), desc: t('indepCriteria4Desc') },
  ]
  const verifySteps = [
    { title: t('indepVerify1Title'), desc: t('indepVerify1Desc') },
    { title: t('indepVerify2Title'), desc: t('indepVerify2Desc') },
    { title: t('indepVerify3Title'), desc: t('indepVerify3Desc') },
    { title: t('indepVerify4Title'), desc: t('indepVerify4Desc') },
  ]
  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: '/' },
    { name: 'The Independence Pledge', url: '/independence' },
  ])

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />

      {/* Hero */}
      <section style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '5rem 1.5rem 3rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-sage)',
          marginBottom: 12,
        }}>
          {t('indepKicker')}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(32px, 5vw, 52px)',
          fontWeight: 400,
          color: 'var(--color-ink)',
          lineHeight: 1.15,
          marginBottom: 20,
        }}>
          {t('indepTitle')}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'clamp(15px, 2vw, 17px)',
          fontWeight: 300,
          color: 'var(--color-muted)',
          lineHeight: 1.7,
          maxWidth: 540,
          margin: '0 auto',
        }}>
          {t('indepSubtitle')}
        </p>
      </section>

      {/* The Pledge */}
      <section style={{
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <blockquote style={{
            margin: 0,
            padding: '28px 32px',
            borderLeft: '3px solid var(--color-sage)',
            background: 'var(--color-cream)',
            borderRadius: '0 10px 10px 0',
          }}>
            <p style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(18px, 2.5vw, 22px)',
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'var(--color-ink)',
              lineHeight: 1.55,
              margin: 0,
            }}>
              {t('indepPledge')}
            </p>
          </blockquote>
        </div>
      </section>

      {/* What We Mean by Independent */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3.5rem 1.5rem',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color: 'var(--color-sage)',
          marginBottom: 12,
        }}>
          {t('indepCriteriaKicker')}
        </p>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(24px, 3vw, 32px)',
          fontWeight: 400,
          color: 'var(--color-ink)',
          lineHeight: 1.25,
          marginBottom: 28,
        }}>
          {t('indepCriteriaHeading')}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {criteria.map((item) => (
            <div key={item.title} style={{
              padding: '22px 24px',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-card-bg)',
            }}>
              <h3 style={{
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--color-ink)',
                margin: '0 0 8px',
              }}>
                {item.title}
              </h3>
              <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 300,
                color: 'var(--color-muted)',
                lineHeight: 1.65,
                margin: 0,
              }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Why It Matters */}
      <section style={{
        background: 'white',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-sage)',
            marginBottom: 12,
          }}>
            {t('indepWhyKicker')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            lineHeight: 1.25,
            marginBottom: 24,
          }}>
            {t('indepWhyHeading')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              fontWeight: 300,
              color: 'var(--color-muted)',
              lineHeight: 1.75,
              margin: 0,
            }}>
              {t('indepWhyPara1')}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              fontWeight: 300,
              color: 'var(--color-muted)',
              lineHeight: 1.75,
              margin: 0,
            }}>
              {t('indepWhyPara2')}
            </p>
            <p style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              fontWeight: 300,
              color: 'var(--color-muted)',
              lineHeight: 1.75,
              margin: 0,
            }}>
              {t('indepWhyPara3')}
            </p>
          </div>
        </div>
      </section>

      {/* Pull Quote */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '3rem 1.5rem',
        textAlign: 'center',
      }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(20px, 3vw, 28px)',
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'var(--color-ink)',
          lineHeight: 1.5,
          margin: 0,
        }}>
          {t('indepPullQuote')}
        </p>
      </section>

      {/* How We Verify */}
      <section style={{
        background: 'var(--color-cream)',
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div style={{
          maxWidth: 640,
          margin: '0 auto',
          padding: '3.5rem 1.5rem',
        }}>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: 'var(--color-sage)',
            marginBottom: 12,
          }}>
            {t('indepVerifyKicker')}
          </p>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 3vw, 32px)',
            fontWeight: 400,
            color: 'var(--color-ink)',
            lineHeight: 1.25,
            marginBottom: 24,
          }}>
            {t('indepVerifyHeading')}
          </h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            fontWeight: 300,
            color: 'var(--color-muted)',
            lineHeight: 1.75,
            marginBottom: 28,
          }}>
            {t('indepVerifyIntro')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {verifySteps.map((item) => (
              <div key={item.title} style={{
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--color-sage)',
                  flexShrink: 0,
                  marginTop: 7,
                }} />
                <div>
                  <h3 style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--color-ink)',
                    margin: '0 0 6px',
                  }}>
                    {item.title}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    fontWeight: 300,
                    color: 'var(--color-muted)',
                    lineHeight: 1.65,
                    margin: 0,
                  }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section style={{
        maxWidth: 640,
        margin: '0 auto',
        padding: '4rem 1.5rem 5rem',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(22px, 3vw, 30px)',
          fontWeight: 400,
          color: 'var(--color-ink)',
          lineHeight: 1.3,
          marginBottom: 12,
        }}>
          {t('indepCtaTitle')}
        </h2>
        <p style={{
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          fontWeight: 300,
          color: 'var(--color-muted)',
          lineHeight: 1.65,
          marginBottom: 28,
          maxWidth: 440,
          margin: '0 auto 28px',
        }}>
          {t('indepCtaDesc')}
        </p>
        <Link
          href="/suggest"
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            fontWeight: 500,
            color: 'white',
            background: 'var(--color-sage)',
            padding: '13px 32px',
            borderRadius: 8,
            textDecoration: 'none',
            transition: 'background 0.15s',
          }}
        >
          {t('suggestPlace')}
        </Link>
      </section>
    </div>
  )
}
