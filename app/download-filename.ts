export function timestampDownloadName(filename:string,at=new Date()){
 const extension=filename.match(/\.([a-z0-9]{1,10})$/i)?.[1].toLowerCase();
 return `${at.toISOString().replace(/:/g,'_')}${extension?'.'+extension:''}`;
}
