const VERTICAL_STYLES = {
  sba:          { bg: '#EEEDFE', text: '#3C3489', label: 'Small Batch' },
  collection:   { bg: '#E6F1FB', text: '#185FA5', label: 'Culture' },
  craft:        { bg: '#E1F5EE', text: '#0F6E56', label: 'Craft' },
  fine_grounds: { bg: '#FAEEDA', text: '#854F0B', label: 'Fine Grounds' },
  rest:         { bg: '#FAECE7', text: '#993C1D', label: 'Rest' },
  field:        { bg: '#EAF3DE', text: '#3B6D11', label: 'Field' },
  table:        { bg: '#FCEBEB', text: '#A32D2D', label: 'Table' },
  corner:       { bg: '#FBEAF0', text: '#993556', label: 'Corner' },
  found:        { bg: '#F1EFE8', text: '#5F5E5A', label: 'Found' },
}

export { VERTICAL_STYLES }

export default function VerticalBadge({ vertical, className = '' }) {
  const style = VERTICAL_STYLES[vertical]
  if (!style) return null
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${className}`}
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {style.label}
    </span>
  )
}
