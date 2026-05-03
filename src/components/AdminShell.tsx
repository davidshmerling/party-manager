import { Outlet } from 'react-router-dom'
import { EventProvider } from '../context/EventContext'
import { ClientTechnicalLogBridge } from './ClientTechnicalLogBridge'
import { UserActivityInstrument } from './UserActivityInstrument'

export function AdminShell() {
  return (
    <EventProvider>
      <ClientTechnicalLogBridge />
      <UserActivityInstrument />
      <Outlet />
    </EventProvider>
  )
}
