import AccessDoctorClient from './AccessDoctorClient'

export const metadata = { title: 'Access Doctor — Admin' }
export const dynamic = 'force-dynamic'

// Break-glass console for "an operator says they can't get in". One search
// runs the full diagnosis (auth identity → profile role → claims → listing
// state) and names the fix; the magic-link button unblocks without a password.
export default function AccessDoctorPage() {
  return <AccessDoctorClient />
}
