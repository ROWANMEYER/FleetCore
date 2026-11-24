import Image from "next/image";
import { Package } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./CeramicMobile.module.css";

/** Shared identity for web and mobile dispatch. */
export function CeramicDispatchHeader({ actions }: { actions?: ReactNode }) {
  return <header className={`${styles.listHero} ${actions ? styles.webHero : ""}`}>
    <p className={styles.eyebrow}><Package size={15} />Shipment dispatch</p>
    <h1 className={styles.listTitle}>Ceramic Tiles</h1>
    <p className={styles.heroCopy}>Choose a shipment, assign the load and prepare the driver instructions.</p>
    {actions && <div className={styles.heroActions}>{actions}</div>}
    <Image className={styles.heroTruck} src="/images/ceramic-mobile/v1/dispatch-truck.png" alt="" width={1774} height={887} sizes={actions ? "210px" : "132px"} />
  </header>;
}
