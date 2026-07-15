// lib/press/config.js
// Shared constants for the For Press programme / the Newsroom.

// All press queries route to the editor inbox (Matt's call, 2026-07-15) —
// shown publicly, used as the notify TO and every reply-to, so a journalist
// replying to anything lands in the same place.
export const PRESS_CONTACT_EMAIL = 'editor@australianatlas.com.au'

// Notification sender. Same verified domain as every other Atlas sender;
// replies route to the human press desk.
export const PRESS_FROM = 'Australian Atlas Newsroom <newsroom@australianatlas.com.au>'
export const PRESS_REPLY_TO = process.env.PRESS_REPLY_TO || PRESS_CONTACT_EMAIL

// The stated response promise on the marketing page and in the newsroom.
// Journalists rank a named contact + turnaround above almost everything.
export const PRESS_SLA = 'same business day'

// How we ask to be credited when our data is used.
export const CITATION_LINE = 'Source: Australian Atlas (australianatlas.com.au)'
