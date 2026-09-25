import { useState } from 'react'
import { initials } from '../lib/format.js'
import './Avatar.css'

const SIZES = { sm: 32, md: 40, lg: 72, xl: 96 }

export default function Avatar({ member, size = 'md' }) {
  const [photoFailed, setPhotoFailed] = useState(false)
  const showPhoto = Boolean(member.photo_url) && !photoFailed
  const dimension = SIZES[size] ?? SIZES.md

  return (
    <span
      className="avatar"
      data-size={size}
      style={{ '--avatar-size': `${dimension}px` }}
    >
      {showPhoto ? (
        <img
          className="avatar__photo"
          src={member.photo_url}
          alt=""
          loading="lazy"
          onError={() => setPhotoFailed(true)}
        />
      ) : (
        <span className="avatar__initials" aria-hidden="true">
          {initials(member)}
        </span>
      )}
    </span>
  )
}
