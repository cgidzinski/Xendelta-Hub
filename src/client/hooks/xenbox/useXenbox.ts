import { xenboxKeys } from "./keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, UPLOAD_TIMEOUT_MS, api } from "../../config/api";
import { XenBoxFile, XenBoxFileListResponse } from "../../types/XenBoxFile";

// Chunk size constant (10MB)
const CHUNK_SIZE = 10 * 1024 * 1024;

// Types
interface XenboxUploadResponse {
  _id: string;
  url: string;
  filename: string;
  mimeType: string;
  size: number;
}

interface UploadSessionResponse {
  uploadId: string;
}

interface ChunkUploadResponse {
  chunkIndex: number;
}

// Calculate total chunks based on file size
function calculateTotalChunks(fileSize: number): number {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

// Split file into chunks
function splitFileIntoChunks(file: File, chunkSize: number): Promise<Blob[]> {
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];
    let offset = 0;

    const reader = new FileReader();

    reader.onload = function (e) {
      if (e.target?.result) {
        chunks.push(new Blob([e.target.result as ArrayBuffer]));
        offset += chunkSize;

        if (offset < file.size) {
          readChunk();
        } else {
          resolve(chunks);
        }
      }
    };

    reader.onerror = reject;

    function readChunk() {
      const slice = file.slice(offset, offset + chunkSize);
      reader.readAsArrayBuffer(slice);
    }

    readChunk();
  });
}

// Convert blob to base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// API functions
const initiateUpload = async (
  filename: string,
  totalChunks: number,
  fileSize: number,
): Promise<UploadSessionResponse> => {
  return api.post<UploadSessionResponse>("/api/xenbox/initiate", {
    filename,
    totalChunks,
    fileSize,
  });
};

const uploadChunkApi = async (
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkData: string,
): Promise<ChunkUploadResponse> => {
  return api.post<ChunkUploadResponse>(
    "/api/xenbox/chunk",
    {
      uploadId,
      chunkIndex,
      totalChunks,
      chunkData,
    },
    { timeout: UPLOAD_TIMEOUT_MS },
  );
};

const finalizeUpload = async (uploadId: string): Promise<XenboxUploadResponse> => {
  return api.post<XenboxUploadResponse>("/api/xenbox/finalize", {
    uploadId,
  });
};

const cancelUpload = async (uploadId: string): Promise<void> => {
  await apiClient.delete(`/api/xenbox/${uploadId}`);
};

const deleteXenboxFile = async (fileId: string): Promise<void> => {
  await apiClient.delete(`/api/xenbox/files/${fileId}`);
};

const fetchXenboxFiles = async (search?: string): Promise<XenBoxFile[]> => {
  const params = search ? { search } : {};
  return (await api.get<XenBoxFileListResponse>("/api/xenbox/files", { params })).files;
};

const updateFileSettings = async (
  fileId: string,
  settings: { password?: string | null; expiry?: string | null },
): Promise<{ shareUrl: string; hasPassword: boolean; expiry: string | null }> => {
  return api.put<{ shareUrl: string; hasPassword: boolean; expiry: string | null }>(
    `/api/xenbox/files/${fileId}/settings`,
    settings,
  );
};

// Hook for chunked file uploads
interface UploadFileParams {
  file: File;
  onProgress?: (progress: number) => void;
}

export const useXenboxUpload = () => {
  const queryClient = useQueryClient();

  const { mutateAsync: uploadFile, isPending: isUploading } = useMutation({
    mutationFn: async ({ file, onProgress }: UploadFileParams): Promise<XenboxUploadResponse> => {
      const totalChunks = calculateTotalChunks(file.size);

      // Initiate upload session (includes quota check)
      const { uploadId } = await initiateUpload(file.name, totalChunks, file.size);

      // Split file into chunks
      const chunks = await splitFileIntoChunks(file, CHUNK_SIZE);

      // Upload chunks sequentially
      for (let i = 0; i < chunks.length; i++) {
        const chunkBase64 = await blobToBase64(chunks[i]);
        await uploadChunkApi(uploadId, i, totalChunks, chunkBase64);

        // Report progress
        if (onProgress) {
          const progress = ((i + 1) / totalChunks) * 100;
          onProgress(progress);
        }
      }

      // Finalize upload
      const result = await finalizeUpload(uploadId);

      // Invalidate queries to refresh file list and user profile
      queryClient.invalidateQueries({ queryKey: xenboxKeys.files() });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });

      return result;
    },
  });

  return {
    uploadFile,
    isUploading,
  };
};

// Hook for listing xenbox files
export const useXenboxFiles = (search?: string) => {
  return useQuery({
    queryKey: xenboxKeys.files(search),
    queryFn: () => fetchXenboxFiles(search),
    retry: 1, // Only retry once to avoid duplicate errors
    retryDelay: 1000,
    placeholderData: (previousData) => previousData,
  });
};

// Hook for updating file settings
export const useXenboxFileSettings = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      fileId,
      settings,
    }: {
      fileId: string;
      settings: { password?: string | null; expiry?: string | null };
    }) => updateFileSettings(fileId, settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenboxKeys.files() });
    },
  });
};

// Hook for xenbox operations
export const useXenbox = () => {
  const queryClient = useQueryClient();

  // Mutation for deleting xenbox file
  const deleteMutation = useMutation({
    mutationFn: deleteXenboxFile,
    onSuccess: () => {
      // Invalidate queries to refresh file list and user profile
      queryClient.invalidateQueries({ queryKey: xenboxKeys.files() });
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
    },
  });

  // Mutation for cancelling upload
  const { mutate: cancelUploadMutation } = useMutation({
    mutationFn: cancelUpload,
  });

  return {
    deleteFile: (fileId: string, options?: { onSuccess?: () => void; onError?: (error: Error) => void }) => {
      deleteMutation.mutate(fileId, {
        onSuccess: () => {
          if (options?.onSuccess) {
            options.onSuccess();
          }
        },
        onError: (error: Error) => {
          if (options?.onError) {
            options.onError(error);
          }
        },
      });
    },
    isDeleting: deleteMutation.isPending,
    cancelUpload: (uploadId: string) => cancelUploadMutation(uploadId),
  };
};
