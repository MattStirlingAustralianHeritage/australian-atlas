import AdminNavBar from '@/components/AdminNavBar'

export default function AdminLayout({ children }) {
  return (
    <>
      <AdminNavBar />
      {children}
    </>
  )
}
