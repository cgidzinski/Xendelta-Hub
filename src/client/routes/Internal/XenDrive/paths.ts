// Where XenDrive pages live, so links are built in one place.
export const XENDRIVE_ROOT = "/internal/xendrive";
export const folderPath = (folderId: string) => `${XENDRIVE_ROOT}/folder/${folderId}`;
export const filePath = (fileId: string) => `${XENDRIVE_ROOT}/file/${fileId}`;
