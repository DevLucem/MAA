import type { CSSProperties } from "react";
import boardSvg from "./board.svg";
import calendarSvg from "./calendar.svg";
import chevronRightSvg from "./chevron-right.svg";
import copySvg from "./copy.svg";
import databaseSvg from "./database.svg";
import documentSvg from "./document.svg";
import downloadSvg from "./download.svg";
import ellipsisSvg from "./ellipsis.svg";
import externalLinkSvg from "./external-link.svg";
import filterSvg from "./filter.svg";
import gallerySvg from "./gallery.svg";
import gripSvg from "./grip.svg";
import fullWidthSvg from "./full-width.svg";
import imageSvg from "./image.svg";
import linkSvg from "./link.svg";
import lockSvg from "./lock.svg";
import maximizeSvg from "./maximize.svg";
import menuSvg from "./menu.svg";
import minimizeSvg from "./minimize.svg";
import plusSvg from "./plus.svg";
import restoreSvg from "./restore.svg";
import searchSvg from "./search.svg";
import settingsSvg from "./settings.svg";
import shareSvg from "./share.svg";
import smileSvg from "./smile.svg";
import sortSvg from "./sort.svg";
import starSolidSvg from "./star-solid.svg";
import starSvg from "./star.svg";
import syncSvg from "./sync.svg";
import tableSvg from "./table.svg";
import timelineSvg from "./timeline.svg";
import trashSvg from "./trash.svg";
import unlinkSvg from "./unlink.svg";
import uploadSvg from "./upload.svg";
import xSvg from "./x.svg";

function assetUrl(asset: string | { src: string }): string {
  return typeof asset === "string" ? asset : asset.src;
}

const ICONS = {
  board: assetUrl(boardSvg),
  calendar: assetUrl(calendarSvg),
  "chevron-right": assetUrl(chevronRightSvg),
  copy: assetUrl(copySvg),
  database: assetUrl(databaseSvg),
  document: assetUrl(documentSvg),
  download: assetUrl(downloadSvg),
  ellipsis: assetUrl(ellipsisSvg),
  "external-link": assetUrl(externalLinkSvg),
  filter: assetUrl(filterSvg),
  gallery: assetUrl(gallerySvg),
  grip: assetUrl(gripSvg),
  "full-width": assetUrl(fullWidthSvg),
  image: assetUrl(imageSvg),
  link: assetUrl(linkSvg),
  lock: assetUrl(lockSvg),
  maximize: assetUrl(maximizeSvg),
  menu: assetUrl(menuSvg),
  minimize: assetUrl(minimizeSvg),
  plus: assetUrl(plusSvg),
  restore: assetUrl(restoreSvg),
  search: assetUrl(searchSvg),
  settings: assetUrl(settingsSvg),
  share: assetUrl(shareSvg),
  smile: assetUrl(smileSvg),
  sort: assetUrl(sortSvg),
  star: assetUrl(starSvg),
  "star-solid": assetUrl(starSolidSvg),
  sync: assetUrl(syncSvg),
  table: assetUrl(tableSvg),
  timeline: assetUrl(timelineSvg),
  trash: assetUrl(trashSvg),
  unlink: assetUrl(unlinkSvg),
  upload: assetUrl(uploadSvg),
  x: assetUrl(xSvg),
} as const;

export type IconName = keyof typeof ICONS;

/** Renders a mask-based themeable icon from app/assets/icons. */
export function Icon({
  name,
  className = "size-5",
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`icon ${className}`}
      style={{ "--icon": `url("${ICONS[name]}")` } as CSSProperties}
    />
  );
}
