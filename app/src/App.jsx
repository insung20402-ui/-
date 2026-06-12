import { Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import Home from './pages/Home'
import Places from './pages/Places'
import PlaceDetail from './pages/PlaceDetail'

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/places" element={<Places />} />
        <Route path="/places/:id" element={<PlaceDetail />} />
      </Routes>
      <BottomNav />
    </>
  )
}

export default App
