import Link from 'next/link';
import { PANEL_AREAS } from '@/lib/areas';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className="wb-text-display">webag</h1>
      <nav aria-label="Áreas" className={styles.areas}>
        <Link href={PANEL_AREAS.lojista.basePath} className="wb-text-body-strong">
          {PANEL_AREAS.lojista.title}
        </Link>
        <Link href={PANEL_AREAS.admin.basePath} className="wb-text-body-strong">
          {PANEL_AREAS.admin.title}
        </Link>
      </nav>
    </main>
  );
}
