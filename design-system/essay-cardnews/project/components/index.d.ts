import type * as React from 'react';

/** Author line under the cover title. `avatarSrc` is the Profile group's avatar.png. */
export interface AuthorRowProps { name: string; handle?: string; avatarSrc?: string }
export declare function AuthorRow(props: AuthorRowProps): React.ReactElement;

/** kind "capture": 900 wide at the original ratio, with a centred source caption. kind "hero": 900 × 675, cover only. No src → a sized placeholder. */
export interface FigureProps { kind?: 'capture' | 'hero'; src?: string; alt?: string; ratio?: number; source?: string; placeholder?: string }
export declare function Figure(props: FigureProps): React.ReactElement;

/** Portrait illustration in a body card's bottom-right corner. width is clamped to 190–330. */
export interface StickerProps { src?: string; alt?: string; width?: number; height?: number }
export declare function Sticker(props: StickerProps): React.ReactElement;

/** Card heading with the mint highlighter. One per card. */
export interface HeadingProps { children: React.ReactNode; className?: string }
export declare function Heading(props: HeadingProps): React.ReactElement;

/** Paragraphs at body size. "\n" in a string is a manual line break. */
export interface BodyTextProps { paragraphs?: React.ReactNode[]; children?: React.ReactNode; className?: string }
export declare function BodyText(props: BodyTextProps): React.ReactElement;

/** The card's one-line conclusion, centred, body-strong in ink. */
export interface ConclusionProps { children: React.ReactNode }
export declare function Conclusion(props: ConclusionProps): React.ReactElement;

/** Inline emphasis in a paragraph: weight 800 + ink. Once per paragraph. */
export interface StrongProps { children: React.ReactNode }
export declare function Strong(props: StrongProps): React.ReactElement;

/** Black label. OpinionCard only. */
export interface TagProps { children?: React.ReactNode }
export declare function Tag(props: TagProps): React.ReactElement;

/** Quote in Nanum Myeongjo inside a 1px ink box. OpinionCard only. */
export interface QuoteBoxProps { children: React.ReactNode; cite?: string }
export declare function QuoteBox(props: QuoteBoxProps): React.ReactElement;

/** 1080 × 1350 cover: title, author, divider, figure, two or three intro lines. */
export interface CoverCardProps { label?: string; title: string; author: AuthorRowProps; figure?: FigureProps; intro?: string | string[] }
export declare function CoverCard(props: CoverCardProps): React.ReactElement;

/** 1080 × 1350 body card: heading, 3–5 paragraphs (~250 chars), conclusion, optional sticker. */
export interface CardProps { label: string; heading: React.ReactNode; paragraphs?: React.ReactNode[]; children?: React.ReactNode; conclusion?: React.ReactNode; sticker?: StickerProps }
export declare function Card(props: CardProps): React.ReactElement;

/** 1080 × 1350 thought card: a centred statement and one question to the reader. */
export interface ThoughtCardProps { label: string; statement: React.ReactNode; emphasis?: React.ReactNode }
export declare function ThoughtCard(props: ThoughtCardProps): React.ReactElement;

/** 1080 × 1350 closing card: Tag, question heading, body, QuoteBox, two right-aligned lines. */
export interface OpinionCardProps { label: string; tag?: string; heading: React.ReactNode; paragraphs: React.ReactNode[]; quote?: React.ReactNode; quoteCite?: string; closing: [string, string] }
export declare function OpinionCard(props: OpinionCardProps): React.ReactElement;

declare global {
  interface Window {
    CardNews: {
      CoverCard: typeof CoverCard; Card: typeof Card; ThoughtCard: typeof ThoughtCard; OpinionCard: typeof OpinionCard;
      Heading: typeof Heading; BodyText: typeof BodyText; Conclusion: typeof Conclusion; AuthorRow: typeof AuthorRow;
      Figure: typeof Figure; Sticker: typeof Sticker; Tag: typeof Tag; QuoteBox: typeof QuoteBox; Strong: typeof Strong;
    };
  }
}
