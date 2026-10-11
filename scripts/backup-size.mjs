// This bounded-memory adapter supports at most 256 MiB of plaintext SQL.
// Encryption/restore need additional copies; operators must budget at least
// 1.5 GiB of free process memory or choose a reviewed streaming adapter.
export const MAX_BACKUP_SQL_BYTES=256*1024*1024;
export const MAX_BACKUP_ARTIFACT_BYTES=MAX_BACKUP_SQL_BYTES+4096;
import {open} from 'node:fs/promises';
export async function readBoundedArtifact(file){
  const handle=await open(file,'r');
  try{
    const info=await handle.stat();if(!info.isFile())throw new Error('Backup artifact must be a regular file.');enforceBackupSize(info.size,true);
    const bytes=Buffer.alloc(info.size);let offset=0;
    while(offset<bytes.length){const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);if(!bytesRead)throw new Error('Backup artifact changed while reading.');offset+=bytesRead;}
    const extra=Buffer.alloc(1);if((await handle.read(extra,0,1,offset)).bytesRead)throw new Error('Backup artifact grew while reading; bounded reader refused it.');return bytes;
  }finally{await handle.close();}
}
export function enforceBackupSize(bytes,artifact=false){
  if(!Number.isSafeInteger(bytes)||bytes<0||bytes>(artifact?MAX_BACKUP_ARTIFACT_BYTES:MAX_BACKUP_SQL_BYTES))throw new Error('Backup exceeds the supported 256 MiB SQL size. Retain the previous backup and configure a reviewed streaming backup adapter before growing this database; do not raise this memory bound.');
}
