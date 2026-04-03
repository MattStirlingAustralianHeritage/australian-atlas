'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { createClient } from '@supabase/supabase-js'

// NOTE: Requires a 'event-images' bucket in Supabase Storage.
// Create it via the Supabase dashboard with public access enabled.

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const CATEGORIES = [
  { value: 'festival', label: 'Festival' },
  { value: 'market', label: 'Market' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'tour', label: 'Tour' },
  { value: 'exhibition', label: 'Exhibition' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'other', label: 'Other' },
]

const STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']

const VERTICALS = [
  { id: 'australian-atlas', label: 'Australian Atlas', color: '#1a1614', locked: true },
  { id: 'sba', label: 'Small Batch Atlas', color: '#7c3a2e' },
  { id: 'rest', label: 'Rest Atlas', color: '#5f8a7e' },
  { id: 'fine_grounds', label: 'Fine Grounds Atlas', color: '#8b6914' },
  { id: 'craft', label: 'Craft Atlas', color: '#b87333' },
  { id: 'collection', label: 'Collection Atlas', color: '#4a5568' },
  { id: 'field', label: 'Field Atlas', color: '#2d6a4f' },
  { id: 'corner', label: 'Corner Atlas', color: '#6b4c8a' },
  { id: 'found', label: 'Found Atlas', color: '#c2553a' },
  { id: 'table', label: 'Table Atlas', color: '#b8860b' },
]

const CARD_STYLE = {
  style: {
    base: {
      fontSize: '16px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#1a1614',
      '::placeholder': { color: '#999' },
    },
    invalid: { color: '#c0392b' },
  },
}

function EventForm() {
  const router = useRouter()
  const stripe = useStripe()
  const elements = useElements()
  const fileInputRef = useRef(null)

  // Form state
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    startDate: '',
    endDate: '',
    locationName: '',
    address: '',
    suburb: '',
    state: '',
    websiteUrl: '',
    ticketUrl: '',
    submitterName: '',
    submitterEmail: '',
    submitterOrganisation: '',
  })

  const [verticals, setVerticals] = useState(['australian-atlas'])
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageUrl, setImageUrl] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [errors, setErrors] = useState({})
  const [showPayment, setShowPayment] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  const wordCount = form.description.trim() ? form.description.trim().split(/\s+/).length : 0

  // Image handling
  const handleImageSelect = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return

    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setUploading(true)
    setUploadProgress(0)

    try {
      const ext = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const filePath = `submissions/${fileName}`

      // Simulate progress since Supabase doesn't provide upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const { data, error } = await supabase.storage
        .from('event-images')
        .upload(filePath, file, { cacheControl: '3600', upsert: false })

      clearInterval(progressInterval)

      if (error) throw error

      const { data: urlData } = supabase.storage.from('event-images').getPublicUrl(filePath)
      setImageUrl(urlData.publicUrl)
      setUploadProgress(100)
    } catch (err) {
      console.error('Upload error:', err)
      setImageUrl(null)
      setUploadProgress(0)
      setErrors(prev => ({ ...prev, image: 'Failed to upload image. Please try again.' }))
    } finally {
      setUploading(false)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    handleImageSelect(file)
  }, [handleImageSelect])

  const toggleVertical = (id) => {
    if (id === 'australian-atlas') return
    setVerticals(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    )
  }

  // Validation
  const validate = () => {
    const newErrors = {}
    if (!form.name.trim()) newErrors.name = 'Event name is required'
    if (!form.description.trim()) newErrors.description = 'Description is required'
    if (wordCount > 300) newErrors.description = 'Description must be 300 words or fewer'
    if (!form.category) newErrors.category = 'Category is required'
    if (!form.startDate) newErrors.startDate = 'Start date is required'
    if (!form.endDate) newErrors.endDate = 'End date is required'
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      newErrors.endDate = 'End date must be after start date'
    }
    if (!form.locationName.trim()) newErrors.locationName = 'Location name is required'
    if (!form.address.trim()) newErrors.address = 'Address is required'
    if (!form.suburb.trim()) newErrors.suburb = 'Suburb is required'
    if (!form.state) newErrors.state = 'State is required'
    if (!imageUrl && !uploading) newErrors.image = 'Event image is required'
    if (!form.submitterName.trim()) newErrors.submitterName = 'Your name is required'
    if (!form.submitterEmail.trim()) newErrors.submitterEmail = 'Your email is required'
    if (form.submitterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.submitterEmail)) {
      newErrors.submitterEmail = 'Please enter a valid email'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleValidateAndShowPayment = () => {
    if (validate()) {
      setShowPayment(true)
      setTimeout(() => {
        document.getElementById('payment-section')?.scrollIntoView({ behavior: 'smooth' })
      }, 100)
    }
  }

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!stripe || !elements) return
    if (!validate()) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      // 1. Create payment intent
      const piRes = await fetch('/api/events/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventName: form.name,
          submitterEmail: form.submitterEmail,
        }),
      })
      const piData = await piRes.json()
      if (piData.error) throw new Error(piData.error)

      // 2. Confirm payment
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(piData.clientSecret, {
        payment_method: {
          card: elements.getElement(CardElement),
          billing_details: {
            name: form.submitterName,
            email: form.submitterEmail,
          },
        },
      })

      if (stripeError) throw new Error(stripeError.message)

      // 3. Submit event data
      const submitRes = await fetch('/api/events/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          name: form.name,
          description: form.description,
          category: form.category,
          startDate: form.startDate,
          endDate: form.endDate,
          locationName: form.locationName,
          address: form.address,
          suburb: form.suburb,
          state: form.state,
          websiteUrl: form.websiteUrl,
          ticketUrl: form.ticketUrl,
          imageUrl,
          verticals,
          submitterName: form.submitterName,
          submitterEmail: form.submitterEmail,
          submitterOrganisation: form.submitterOrganisation,
        }),
      })
      const submitData = await submitRes.json()
      if (submitData.error) throw new Error(submitData.error)

      // 4. Redirect to confirmation
      router.push('/events/submit/confirmation')
    } catch (err) {
      console.error('Submit error:', err)
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-cream)' }}>
      <div className="max-w-[640px] mx-auto px-5 py-16">
        <header className="mb-12">
          <h1
            className="text-3xl md:text-4xl mb-3"
            style={{ fontFamily: 'var(--font-serif)', color: 'var(--color-ink)' }}
          >
            Submit an event
          </h1>
          <p style={{ color: 'var(--color-muted)', lineHeight: 1.6 }}>
            List your event across the Australian Atlas network. Submissions are reviewed within 48 hours.
          </p>
        </header>

        <form onSubmit={handleSubmit} noValidate>
          {/* Event Details */}
          <section className="mb-10">
            <h2
              className="text-xl mb-6 pb-3"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              Event details
            </h2>

            <FieldGroup label="Event name" error={errors.name} required>
              <input
                type="text"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                placeholder="e.g. Hunter Valley Wine Festival 2026"
                className="w-full rounded-lg p-3"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>

            <FieldGroup
              label="Description"
              error={errors.description}
              required
              helper={
                <span style={{ color: wordCount > 300 ? '#c0392b' : 'var(--color-muted)' }}>
                  {wordCount}/300 words
                </span>
              }
            >
              <textarea
                value={form.description}
                onChange={e => updateField('description', e.target.value)}
                placeholder="Describe your event..."
                rows={5}
                className="w-full rounded-lg p-3 resize-y"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>

            <FieldGroup label="Category" error={errors.category} required>
              <select
                value={form.category}
                onChange={e => updateField('category', e.target.value)}
                className="w-full rounded-lg p-3 bg-white"
                style={{ border: '1px solid var(--color-border)', color: form.category ? 'var(--color-ink)' : '#999' }}
              >
                <option value="">Select a category</option>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </FieldGroup>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Start date" error={errors.startDate} required>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => updateField('startDate', e.target.value)}
                  className="w-full rounded-lg p-3"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
                />
              </FieldGroup>
              <FieldGroup label="End date" error={errors.endDate} required>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => updateField('endDate', e.target.value)}
                  className="w-full rounded-lg p-3"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
                />
              </FieldGroup>
            </div>
          </section>

          {/* Location */}
          <section className="mb-10">
            <h2
              className="text-xl mb-6 pb-3"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              Location
            </h2>

            <FieldGroup label="Location name" error={errors.locationName} required>
              <input
                type="text"
                value={form.locationName}
                onChange={e => updateField('locationName', e.target.value)}
                placeholder="e.g. Royal Botanic Gardens"
                className="w-full rounded-lg p-3"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>

            <FieldGroup label="Address" error={errors.address} required>
              <input
                type="text"
                value={form.address}
                onChange={e => updateField('address', e.target.value)}
                placeholder="Street address"
                className="w-full rounded-lg p-3"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>

            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Suburb" error={errors.suburb} required>
                <input
                  type="text"
                  value={form.suburb}
                  onChange={e => updateField('suburb', e.target.value)}
                  placeholder="Suburb"
                  className="w-full rounded-lg p-3"
                  style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
                />
              </FieldGroup>
              <FieldGroup label="State" error={errors.state} required>
                <select
                  value={form.state}
                  onChange={e => updateField('state', e.target.value)}
                  className="w-full rounded-lg p-3 bg-white"
                  style={{ border: '1px solid var(--color-border)', color: form.state ? 'var(--color-ink)' : '#999' }}
                >
                  <option value="">Select</option>
                  {STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </FieldGroup>
            </div>
          </section>

          {/* Links */}
          <section className="mb-10">
            <h2
              className="text-xl mb-6 pb-3"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              Links
            </h2>

            <FieldGroup label="Website URL">
              <input
                type="url"
                value={form.websiteUrl}
                onChange={e => updateField('websiteUrl', e.target.value)}
                placeholder="https://"
                className="w-full rounded-lg p-3"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>

            <FieldGroup label="Ticket URL">
              <input
                type="url"
                value={form.ticketUrl}
                onChange={e => updateField('ticketUrl', e.target.value)}
                placeholder="https://"
                className="w-full rounded-lg p-3"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>
          </section>

          {/* Image */}
          <section className="mb-10">
            <h2
              className="text-xl mb-6 pb-3"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              Image
            </h2>

            <FieldGroup label="Event image" error={errors.image} required>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                className="rounded-lg p-8 text-center cursor-pointer transition-colors"
                style={{
                  border: `2px dashed ${dragOver ? 'var(--color-sage)' : 'var(--color-border)'}`,
                  background: dragOver ? 'rgba(95,138,126,0.05)' : 'white',
                }}
              >
                {imagePreview ? (
                  <div>
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded-lg mb-3"
                      style={{ objectFit: 'cover' }}
                    />
                    {uploading && (
                      <div className="w-full max-w-xs mx-auto rounded-full overflow-hidden h-2 mt-2" style={{ background: 'var(--color-border)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%`, background: 'var(--color-sage)' }}
                        />
                      </div>
                    )}
                    {uploadProgress === 100 && !uploading && (
                      <p className="text-sm mt-2" style={{ color: 'var(--color-sage)' }}>Uploaded successfully</p>
                    )}
                    <p className="text-sm mt-2" style={{ color: 'var(--color-muted)' }}>Click or drag to replace</p>
                  </div>
                ) : (
                  <div>
                    <svg className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p style={{ color: 'var(--color-muted)' }}>
                      Drag and drop an image, or <span style={{ color: 'var(--color-sage)', textDecoration: 'underline' }}>browse</span>
                    </p>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>JPG, PNG or WebP. Landscape recommended.</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => handleImageSelect(e.target.files[0])}
                  className="hidden"
                />
              </div>
            </FieldGroup>
          </section>

          {/* Verticals */}
          <section className="mb-10">
            <h2
              className="text-xl mb-6 pb-3"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              Atlas verticals
            </h2>

            <label
              className="block mb-3"
              style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-muted)' }}
            >
              Show this event on
            </label>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {VERTICALS.map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => toggleVertical(v.id)}
                  className="flex items-center gap-2 p-3 rounded-lg text-left text-sm transition-colors"
                  style={{
                    border: `1px solid ${verticals.includes(v.id) ? v.color : 'var(--color-border)'}`,
                    background: verticals.includes(v.id) ? `${v.color}08` : 'white',
                    opacity: v.locked ? 0.7 : 1,
                    cursor: v.locked ? 'default' : 'pointer',
                  }}
                >
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ background: v.color }}
                  />
                  <span style={{ color: 'var(--color-ink)', fontSize: 13 }}>{v.label}</span>
                  {verticals.includes(v.id) && (
                    <svg className="w-4 h-4 ml-auto" style={{ color: v.color }} fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              Select the atlases relevant to your event. Australian Atlas is always included.
            </p>
          </section>

          {/* Submitter Details */}
          <section className="mb-10">
            <h2
              className="text-xl mb-6 pb-3"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              Your details
            </h2>

            <FieldGroup label="Your name" error={errors.submitterName} required>
              <input
                type="text"
                value={form.submitterName}
                onChange={e => updateField('submitterName', e.target.value)}
                className="w-full rounded-lg p-3"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>

            <FieldGroup label="Your email" error={errors.submitterEmail} required>
              <input
                type="email"
                value={form.submitterEmail}
                onChange={e => updateField('submitterEmail', e.target.value)}
                className="w-full rounded-lg p-3"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>

            <FieldGroup label="Organisation">
              <input
                type="text"
                value={form.submitterOrganisation}
                onChange={e => updateField('submitterOrganisation', e.target.value)}
                placeholder="Optional"
                className="w-full rounded-lg p-3"
                style={{ border: '1px solid var(--color-border)', color: 'var(--color-ink)' }}
              />
            </FieldGroup>
          </section>

          {/* Editorial notice */}
          <blockquote
            className="rounded-lg p-5 mb-10"
            style={{
              background: 'white',
              borderLeft: '3px solid var(--color-sage)',
              color: 'var(--color-muted)',
              fontSize: 14,
              lineHeight: 1.6,
            }}
          >
            All submissions are editorially reviewed before going live. We check for relevance, quality and accuracy.
            Listing fee is <strong style={{ color: 'var(--color-ink)' }}>$49 AUD</strong> per event. Your listing will
            remain active until the event end date.
          </blockquote>

          {/* Validate + show payment */}
          {!showPayment && (
            <button
              type="button"
              onClick={handleValidateAndShowPayment}
              className="w-full rounded-lg font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--color-sage)', height: 48 }}
            >
              Continue to payment
            </button>
          )}

          {/* Payment */}
          {showPayment && (
            <section id="payment-section" className="mb-10">
              <h2
                className="text-xl mb-6 pb-3"
                style={{
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--color-ink)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                Payment
              </h2>

              <div
                className="rounded-lg p-4 mb-6"
                style={{ border: '1px solid var(--color-border)', background: 'white' }}
              >
                <CardElement options={CARD_STYLE} />
              </div>

              {submitError && (
                <div
                  className="rounded-lg p-4 mb-4 text-sm"
                  style={{ background: '#fef2f2', color: '#c0392b', border: '1px solid #fecaca' }}
                >
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !stripe}
                className="w-full rounded-lg font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--color-sage)', height: 48 }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing payment...
                  </span>
                ) : (
                  'Pay $49 and submit event'
                )}
              </button>
            </section>
          )}
        </form>
      </div>
    </div>
  )
}

function FieldGroup({ label, children, error, required, helper }) {
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1.5">
        <label
          style={{
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-muted)',
          }}
        >
          {label}
          {required && <span style={{ color: '#c0392b' }}> *</span>}
        </label>
        {helper}
      </div>
      {children}
      {error && (
        <p className="text-xs mt-1" style={{ color: '#c0392b' }}>{error}</p>
      )}
    </div>
  )
}

export default function EventSubmitPage() {
  return (
    <Elements stripe={stripePromise}>
      <EventForm />
    </Elements>
  )
}
