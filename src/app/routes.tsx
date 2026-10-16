import { Route, Routes } from 'react-router-dom'
import { BoothPage } from './screens/BoothPage.tsx'
import { CreateBoothPage } from './screens/CreateBoothPage.tsx'
import { JoinBoothPage } from './screens/JoinBoothPage.tsx'
import { LandingPage } from './screens/LandingPage.tsx'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/create" element={<CreateBoothPage />} />
      <Route path="/join" element={<JoinBoothPage />} />
      <Route path="/booth" element={<BoothPage />} />
    </Routes>
  )
}
