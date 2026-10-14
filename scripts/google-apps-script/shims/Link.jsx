import React from 'react';

function getGasHref(href) {
  const baseUrl = window.__GAS_WEB_APP_URL || window.location.href.split('?')[0];
  if (String(href).startsWith('/adchemshoa')) return `${baseUrl}?page=admin`;
  if (String(href).startsWith('/nhanvien') || href === '/') return `${baseUrl}?page=employee`;
  return href;
}

export default function Link({ href, children, onClick, ...props }) {
  return (
    <a href={getGasHref(href)} onClick={onClick} {...props}>
      {children}
    </a>
  );
}
