import type { ReactNode } from 'react';

/** Ytans botten. */
export type Botten = 'ink' | 'skog' | 'rost';
/** Hålens och strecken färg. */
export type Black = 'ockra' | 'papper' | 'black' | 'skog' | 'rost';

export interface OrdbildProps {
  /** URL till en fil ur resursgruppen Logotyp. Välj färgvariant efter ytan. */
  src: string;
  /** Standard: "Maskinrepubliken". Sätt "" om ordbilden står bredvid samma namn i text. */
  alt?: string;
  /** Bredd i px. Aldrig under 120. Standard 260. */
  bredd?: number;
  klass?: string;
}
export function Ordbild(p: OrdbildProps): JSX.Element;

export interface PerforeringProps {
  /** Antal hålplatser i sidled. Standard 13. */
  kolumner?: number;
  /** Antal rader. Standard 3. */
  rader?: number;
  /** "tat" (två tredjedelar), "gles" (en tredjedel) eller ett tal 0–1. */
  tathet?: 'tat' | 'gles' | number;
  botten?: Botten;
  hal?: Black;
  /** Kuggcirklar i kanterna. Gör ytan till ett kort — då aldrig i samma block som ordbilden. */
  kugg?: boolean;
  /** Frö för hålmönstret. Samma frö ger samma yta varje gång. Standard 7. */
  fro?: number;
  /** Sätt bara om ytan bär betydelse; annars är den dekor och döljs för skärmläsare. */
  etikett?: string;
  klass?: string;
}
export function Perforering(p: PerforeringProps): JSX.Element;

export interface RingMatareProps {
  /** Antal klara steg. Ringarna fylls inifrån och ut. */
  klara: number;
  /** Antal ringar totalt. 5–9 fungerar; fler ryms inte. Standard 7. */
  totalt?: number;
  /** Sidmått i px. Standard 260. */
  storlek?: number;
  klarFarg?: Black;
  aterFarg?: Black;
  /** Standard: "N av M klara". */
  etikett?: string;
  klass?: string;
}
export function RingMatare(p: RingMatareProps): JSX.Element;

export interface KnappProps {
  /** Finns href blir knappen en länk. */
  href?: string;
  variant?: 'primar' | 'sekundar' | 'pa-mork';
  storlek?: 'normal' | 'stor';
  inaktiv?: boolean;
  type?: 'button' | 'submit';
  onClick?: (e: unknown) => void;
  children: ReactNode;
  klass?: string;
}
export function Knapp(p: KnappProps): JSX.Element;

export interface BrickaProps {
  variant?: 'normal' | 'pa-mork' | 'fylld';
  children: ReactNode;
  klass?: string;
}
export function Bricka(p: BrickaProps): JSX.Element;

export interface SektionsRubrikProps {
  /** Ögonbrynet, versaler. Till exempel "TYPOGRAFI". */
  avdelning?: string;
  /** Rubriken. Versaler, högst fyra ord. */
  titel: string;
  /** Kursiv svans bredvid rubriken. Till exempel "i tre steg". */
  svans?: string;
  paMork?: boolean;
  klass?: string;
}
export function SektionsRubrik(p: SektionsRubrikProps): JSX.Element;

export interface KortProps {
  rubrik?: ReactNode;
  /** Löptext. Högst 34 tecken bred. */
  children?: ReactNode;
  /** En Perforering som går ut i kortets nederkant. Valfritt. */
  yta?: ReactNode;
  /** Finns href blir hela kortet en länk. */
  href?: string;
  klass?: string;
}
export function Kort(p: KortProps): JSX.Element;

export interface NavProps {
  /** En Ordbild. Enradaren i trånga lägen. */
  ordbild: ReactNode;
  lankar: Array<{ text: string; href: string; aktiv?: boolean }>;
  /** En Knapp längst till höger. Valfritt. */
  knapp?: ReactNode;
  paMork?: boolean;
  /** Etikett för nav-landmärket. Standard "Huvudmeny". */
  etikett?: string;
  klass?: string;
}
export function Nav(p: NavProps): JSX.Element;

export interface HeroProps {
  /** Versaler, högst fyra ord per rad. */
  rubrik: ReactNode;
  ingress?: ReactNode;
  knapp?: ReactNode;
  /** En kursiv rad bredvid knappen, i ockra. */
  loft?: string;
  /** Brickor under en linje längst ned. */
  brickor?: string[];
  klass?: string;
}
export function Hero(p: HeroProps): JSX.Element;

export interface SidfotProps {
  ordbild: ReactNode;
  tagline?: string;
  spalter?: Array<{ etikett: string; rader: Array<string | { text: string; href: string }> }>;
  /** Ett motiv eller en Perforering under kroppen. Valfritt. */
  yta?: ReactNode;
  klass?: string;
}
export function Sidfot(p: SidfotProps): JSX.Element;
