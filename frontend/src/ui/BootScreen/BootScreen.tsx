import styles from './BootScreen.module.css';

/**
 * 起動中・起動失敗の画面。
 *
 * 失敗の切り分け（WASM / 取得 / データ不正）は App の describeBootFailure が行い、
 * ここは受け取った文面をそのまま読める形で見せる。
 * 黙って白い画面を出さないこと、次に何をすればよいかを示すことが役目。
 */
export function BootScreen({ error }: { error?: string | undefined }) {
  if (error !== undefined) {
    return (
      <div className={`${styles.screen} ${styles.failed}`} role="alert">
        <div className={styles.inner}>
          <h1 className={styles.title}>起動できませんでした</h1>
          <p className={styles.message}>捜査資料を読み込めませんでした。</p>
          <pre className={styles.detail}>{error}</pre>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.retry}
              onClick={() => {
                window.location.reload();
              }}
            >
              再読み込み
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Audit Trail</h1>
        {/* 初回は sql.js の wasm（約660KB）を落とすので、数秒かかることがある。 */}
        <p className={styles.message} role="status">
          捜査資料を読み込んでいます…
        </p>
        <div className={styles.progressTrack} aria-hidden="true">
          <div className={styles.progressBar} />
        </div>
      </div>
    </div>
  );
}
