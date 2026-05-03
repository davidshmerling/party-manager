type Props = {
  error: string | null
  listNotice: string | null
  pasteMsg: string | null
  pasteErrorLog: string[] | null
}

export function GuestListPageBanners({ error, listNotice, pasteMsg, pasteErrorLog }: Props) {
  return (
    <>
      {error && <div className="banner error">{error}</div>}
      {listNotice && <div className="banner info">{listNotice}</div>}
      {pasteMsg && <div className="banner info">{pasteMsg}</div>}
      {pasteErrorLog && pasteErrorLog.length > 0 && (
        <div className="banner error paste-error-log" role="alert">
          <strong>לא בוצעה הוספה — יש לתקן ולנסות שוב.</strong>
          <ul className="paste-error-ul">
            {pasteErrorLog.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
