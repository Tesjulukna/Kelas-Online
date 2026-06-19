const paths = {
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9.5a6 6 0 0 0-12 0c0 7-2.5 7.5-2.5 7.5h17S18 16.5 18 9.5Z" />
      <path d="M9.5 20a2.8 2.8 0 0 0 5 0" />
    </>
  ),
  bookOpen: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" />
    </>
  ),
  calendar: (
    <>
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M4.5 6h15" />
      <rect width="17" height="16" x="3.5" y="5" rx="2.5" />
      <path d="M8 11h.01" />
      <path d="M12 11h.01" />
      <path d="M16 11h.01" />
      <path d="M8 15h.01" />
      <path d="M12 15h.01" />
    </>
  ),
  certificate: (
    <>
      <circle cx="12" cy="9" r="4" />
      <path d="M9.5 12.5 8 21l4-2 4 2-1.5-8.5" />
      <path d="m9.5 8.8 1.6 1.6 3.2-3.1" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12 2.3 2.3 4.8-5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5l3.4 2" />
    </>
  ),
  cart: (
    <>
      <path d="M4 5h2l2 10.5h9.5l2-7.5H7.2" />
      <circle cx="9.5" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 19h14" />
    </>
  ),
  fileText: (
    <>
      <path d="M6.5 3.5h7L18 8v12.5H6.5z" />
      <path d="M13.5 3.5V8H18" />
      <path d="M9 12h6" />
      <path d="M9 15.5h6" />
    </>
  ),
  filter: (
    <>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6A3 3 0 0 0 13.4 13.4" />
      <path d="M9.9 5.2A10.5 10.5 0 0 1 12 5c6 0 9.5 7 9.5 7a15 15 0 0 1-3.1 4.1" />
      <path d="M6.7 6.7C4 8.4 2.5 12 2.5 12s3.5 7 9.5 7a10.7 10.7 0 0 0 4.1-.8" />
    </>
  ),
  image: (
    <>
      <rect width="16" height="14" x="4" y="5" rx="2" />
      <path d="m7 16 3.2-3.2a1.5 1.5 0 0 1 2.1 0L16 16.5" />
      <path d="m14.5 14 1.2-1.2a1.5 1.5 0 0 1 2.1 0L20 15" />
      <circle cx="9" cy="9" r="1" />
    </>
  ),
  instagram: (
    <>
      <rect width="16" height="16" x="4" y="4" rx="4" />
      <circle cx="12" cy="12" r="3.2" />
      <path d="M16.8 7.2h.01" />
    </>
  ),
  layoutDashboard: (
    <>
      <rect width="7" height="8" x="3.5" y="3.5" rx="2" />
      <rect width="10" height="5.5" x="13" y="3.5" rx="2" />
      <rect width="10" height="8" x="3.5" y="14.5" rx="2" />
      <rect width="7" height="11" x="16" y="12" rx="2" />
    </>
  ),
  link: (
    <>
      <path d="M9.5 14.5 14.5 9.5" />
      <path d="M8 11.5 6.9 12.6a3.5 3.5 0 0 0 5 5l1.1-1.1" />
      <path d="M16 12.5 17.1 11.4a3.5 3.5 0 0 0-5-5L11 7.5" />
    </>
  ),
  lock: (
    <>
      <rect width="15" height="10" x="4.5" y="10.5" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
      <path d="M12 14.5v2" />
    </>
  ),
  logIn: (
    <>
      <path d="M14 4.5h3.5A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5H14" />
      <path d="M4 12h10" />
      <path d="m10 8 4 4-4 4" />
    </>
  ),
  logOut: (
    <>
      <path d="M10 4.5H6.5A2.5 2.5 0 0 0 4 7v10a2.5 2.5 0 0 0 2.5 2.5H10" />
      <path d="M20 12H10" />
      <path d="m14 8 6 4-6 4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 13.5h3l10-5v11l-10-5H4z" />
      <path d="M7 14.5 8.5 21h3" />
      <path d="M20 10.5c1 1 1 2 0 3" />
    </>
  ),
  message: (
    <>
      <path d="M5 5h14v11H8l-4 4V6a1 1 0 0 1 1-1Z" />
      <path d="M8 9h8" />
      <path d="M8 12.5h5" />
    </>
  ),
  moreVertical: (
    <>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4z" />
    </>
  ),
  send: (
    <>
      <path d="m21 3-7.5 18-3.2-7.3L3 10.5z" />
      <path d="m10.3 13.7 4.4-4.4" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.3 10.8 7.4-4.6" />
      <path d="m8.3 13.2 7.4 4.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2" />
      <path d="M12 18.3v2.2" />
      <path d="M4.6 7.8 6.5 9" />
      <path d="m17.5 15 1.9 1.2" />
      <path d="m4.6 16.2 1.9-1.2" />
      <path d="m17.5 9 1.9-1.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.5-2.7 7.8-7 9-4.3-1.2-7-4.5-7-9V6z" />
      <path d="m8.5 12 2.2 2.2 4.8-5" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5 14.4 9l5.6 3-5.6 3L12 20.5 9.6 15 4 12l5.6-3z" />
      <path d="M19.5 4.5v4" />
      <path d="M21.5 6.5h-4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 20V10" />
      <path d="m8 14 4-4 4 4" />
      <path d="M5 5h14" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.2-4 4-6 7.5-6s6.3 2 7.5 6" />
    </>
  ),
  userPen: (
    <>
      <circle cx="10" cy="8" r="4" />
      <path d="M3.5 20c1.1-4 3.7-6 6.5-6" />
      <path d="M15.5 17.5 20 13l1.5 1.5-4.5 4.5H15.5z" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  trendingUp: (
    <>
      <path d="m4 16 5-5 4 4 7-8" />
      <path d="M15 7h5v5" />
    </>
  ),
  users: (
    <>
      <path d="M16 19c0-2.2-1.8-4-4-4H7c-2.2 0-4 1.8-4 4" />
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M22 19c0-2-1.3-3.5-3.2-3.9" />
      <path d="M16.5 4.4a3.4 3.4 0 0 1 0 7.2" />
    </>
  ),
  video: (
    <>
      <rect width="12" height="10" x="3.5" y="7" rx="2" />
      <path d="m15.5 10 5-3v10l-5-3z" />
    </>
  ),
  youtube: (
    <>
      <rect width="18" height="13" x="3" y="5.5" rx="3" />
      <path d="m10.5 9 4.2 2.8-4.2 2.8z" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 7.5h15A2.5 2.5 0 0 1 21.5 10v8A2.5 2.5 0 0 1 19 20.5H5A2.5 2.5 0 0 1 2.5 18V6A2.5 2.5 0 0 1 5 3.5h12" />
      <path d="M16 13h5.5" />
      <path d="M17.5 13h.01" />
    </>
  ),
  x: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  undo: (
    <>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </>
  ),
  redo: (
    <>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </>
  ),
  rectangle: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
    </>
  ),
  circle: (
    <>
      <circle cx="12" cy="12" r="9" />
    </>
  ),
  line: (
    <>
      <path d="M5 12h14" />
    </>
  ),
  qr: (
    <>
      <rect width="6" height="6" x="3" y="3" rx="1" />
      <rect width="6" height="6" x="15" y="3" rx="1" />
      <rect width="6" height="6" x="3" y="15" rx="1" />
      <path d="M15 15h3v3h-3zm3 3h3v3h-3zm-3 3h3v3h-3z" />
      <path d="M11 3h2v2h-2zm0 4h2v2h-2zm0 4h2v2h-2z" />
      <path d="M3 11h2v2H3zm4 0h2v2H7zm4 4h2v2h-2zm4-4h2v2h-2z" />
    </>
  ),
}

function Icon({ name, className = '', title }) {
  return (
    <svg
      className={`icon ${className}`.trim()}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {paths[name]}
    </svg>
  )
}

export default Icon
