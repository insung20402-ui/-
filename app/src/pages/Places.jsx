import { Link } from 'react-router-dom'
import { places } from '../data/places'
import './Places.css'

export default function Places() {
  return (
    <div className="page">
      <h1 className="page-title">어디로 갈까요?</h1>
      <ul className="place-list">
        {places.map((place) => (
          <li key={place.id}>
            <Link to={`/places/${place.id}`} className="place-card">
              <div>
                <div className="place-name">{place.name}</div>
                <div className="place-desc">{place.description}</div>
              </div>
              <span className="place-floor">{place.floor}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
