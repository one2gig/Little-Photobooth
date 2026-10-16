import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes.tsx'

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
