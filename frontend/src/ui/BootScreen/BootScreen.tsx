import styles from './BootScreen.module.css';

/**
 * 起動中・起動失敗の画面。
 *
 * 本格的なエラー画面（WASMロード失敗 / CASEデータ取得失敗の切り分け）は
 * Phase 5 の Issue #29 で作る。ここでは黙って白い画面を出さないことだけを担保する。
 */
export function BootScreen({ error }: { error?: string | undefined }) {
  if (error !== undefined) {
    return (
      <div className={`${styles.screen} ${styles.failed}`}>
        <div className={styles.inner}>
          <h1 className={styles.title}>起動できませんでした</h1>
          <p className={styles.message}>
            捜査資料の読み込みに失敗しました。再読み込みを試してください。
          </p>
          <pre className={styles.detail}>{error}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Audit Trail</h1>
        <p className={styles.message}>捜査資料を読み込んでいます…</p>
      </div>
    </div>
  );
}
