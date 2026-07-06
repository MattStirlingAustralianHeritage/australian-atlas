// Vertical design tokens (badge background, text/accent colour, display label).
// Kept in a server-safe module — NO 'use client' — so server components can read
// individual fields (e.g. VERTICAL_STYLES[key].text) without crossing the RSC
// client-module boundary. Client components import the same object via a
// re-export from components/VerticalBadge.js.
export const VERTICAL_STYLES = {
  sba:          { bg: '#EEEDFE', text: '#3C3489', label: 'Small Batch' },
  collection:   { bg: '#E6F1FB', text: '#185FA5', label: 'Culture' },
  craft:        { bg: '#E1F5EE', text: '#0F6E56', label: 'Craft' },
  fine_grounds: { bg: '#FAEEDA', text: '#854F0B', label: 'Fine Grounds' },
  rest:         { bg: '#FAECE7', text: '#993C1D', label: 'Rest' },
  field:        { bg: '#EAF3DE', text: '#3B6D11', label: 'Field' },
  table:        { bg: '#FCEBEB', text: '#A32D2D', label: 'Table' },
  corner:       { bg: '#FBEAF0', text: '#993556', label: 'Corner' },
  found:        { bg: '#F1EFE8', text: '#5F5E5A', label: 'Found' },
  way:          { bg: '#EEF0E2', text: '#525E36', label: 'Way' },
}
