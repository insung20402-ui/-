import { useNavigate } from 'react-router-dom'
import Mascot3D from '../components/Mascot3D'
import './Home.css'

export default function Home() {
  const navigate = useNavigate()

  return (
    <div className="page home">
      <h1 className="school-title">만수중학교</h1>
      <p className="school-subtitle">교내 길찾기 도우미</p>

      <Mascot3D height={320} />

      <p className="mascot-caption">마우스/손가락으로 캐릭터를 돌려볼 수 있어요</p>

      <button className="primary-btn" onClick={() => navigate('/places')}>
        내비게이션 시작하기
      </button>
    </div>
  )
}
