import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { places } from '../data/places'
import './PlaceDetail.css'

const storageKey = (id) => `mansu-media-${id}`

export default function PlaceDetail() {
  const { id } = useParams()
  const place = places.find((p) => p.id === id)
  const [media, setMedia] = useState([])

  useEffect(() => {
    const saved = localStorage.getItem(storageKey(id))
    setMedia(saved ? JSON.parse(saved) : [])
  }, [id])

  const handleFiles = (e) => {
    const files = Array.from(e.target.files)
    files.forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setMedia((prev) => {
          const next = [...prev, { type: file.type, url: reader.result }]
          localStorage.setItem(storageKey(id), JSON.stringify(next))
          return next
        })
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeMedia = (index) => {
    setMedia((prev) => {
      const next = prev.filter((_, i) => i !== index)
      localStorage.setItem(storageKey(id), JSON.stringify(next))
      return next
    })
  }

  if (!place) {
    return (
      <div className="page">
        <p>장소를 찾을 수 없습니다.</p>
        <Link to="/places">목록으로 돌아가기</Link>
      </div>
    )
  }

  return (
    <div className="page">
      <Link to="/places" className="back-link">← 목록으로</Link>
      <h1 className="page-title">{place.name}</h1>
      <p className="place-detail-desc">{place.floor} · {place.description}</p>

      <div className="media-grid">
        {media.map((item, i) => (
          <div className="media-item" key={i}>
            {item.type.startsWith('video') ? (
              <video src={item.url} controls />
            ) : (
              <img src={item.url} alt={`${place.name} 사진 ${i + 1}`} />
            )}
            <button className="remove-btn" onClick={() => removeMedia(i)}>삭제</button>
          </div>
        ))}
        {media.length === 0 && (
          <p className="empty-hint">아직 등록된 사진/영상이 없어요. 직접 촬영해서 추가해보세요!</p>
        )}
      </div>

      <label className="capture-btn">
        📷 사진/영상 촬영하여 추가
        <input
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          onChange={handleFiles}
          hidden
        />
      </label>
    </div>
  )
}
