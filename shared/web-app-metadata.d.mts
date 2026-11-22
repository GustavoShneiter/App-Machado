export type WebAppMetadataValues = {title:string;appleTitle:string;theme:string;manifest:string;appleIcon:string;icon:string};
export function webAppMetadata(pathname:string,professionalEdition?:boolean):WebAppMetadataValues;
export function applyWebAppMetadata(html:string,pathname:string,professionalEdition?:boolean):string;
