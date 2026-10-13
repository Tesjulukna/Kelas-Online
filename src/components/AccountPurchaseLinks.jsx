export default function AccountPurchaseLinks({ product, accessRows, onOpen }) {
  if (!['account', 'auto_account'].includes(product.productType)) return null
  const purchases = accessRows.filter((access) => access.productId === product.id && access.status === 'active' && access.orderId)
  if (!purchases.length) return null
  return (
    <span className="account-purchase-links">
      {purchases.map((access, index) => (
        <button className="btn btn-secondary" type="button" key={access.id}
          onClick={() => onOpen(product, { accessOrderId: access.orderId })}>
          Lihat Akun {purchases.length > 1 ? index + 1 : ''}
        </button>
      ))}
    </span>
  )
}
