import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "../config/api";
import { ApiResponse } from "../types/api";

// Chunk size constant (10MB)
const CHUNK_SIZE = 10 * 1024 * 1024;

// Types
interface XenboxUploadResponse {
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

interface UploadStatus {
  totalChunks: number;
  receivedChunks: number;
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
const initiateUpload = async (filename: string, totalChunks: number): Promise<UploadSessionResponse> => {
  const response = await apiClient.post<ApiResponse<UploadSessionResponse>>("/api/xenbox/initiate", {
    filename,
    totalChunks,
  });
  return response.data.data!;
};

const uploadChunkApi = async (
  uploadId: string,
  chunkIndex: number,
  totalChunks: number,
  chunkData: string
): Promise<ChunkUploadResponse> => {
  const response = await apiClient.post<ApiResponse<ChunkUploadResponse>>("/api/xenbox/chunk", {
    uploadId,
    chunkIndex,
    totalChunks,
    chunkData,
  });
  return response.data.data!;
};

const finalizeUpload = async (uploadId: string): Promise<XenboxUploadResponse> => {
  const response = await apiClient.post<ApiResponse<XenboxUploadResponse>>("/api/xenbox/finalize", {
    uploadId,
  });
  return response.data.data!;
};

const cancelUpload = async (uploadId: string): Promise<void> => {
  await apiClient.delete(`/api/xenbox/${uploadId}`);
};

const getUploadStatus = async (uploadId: string): Promise<UploadStatus> => {
  const response = await apiClient.get<ApiResponse<UploadStatus>>(`/api/xenbox/status/${uploadId}`);
  return response.data.data!;
};

const deleteXenboxFile = async (fileId: string): Promise<void> => {
  await apiClient.delete(`/api/xenbox/files/${fileId}`);
};

// Hook for chunked file uploads
export const useXenboxUpload = () => {
  const { mutateAsync: uploadFile, isPending: isUploading } = useMutation({
    mutationFn: async (file: File, onProgress?: (progress: number) => void) => {
      const totalChunks = calculateTotalChunks(file.size);
      
      // Initiate upload session
      const { uploadId } = await initiateUpload(file.name, totalChunks);
      
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
      return result;
    },
  });

  return {
    uploadFile,
    isUploading,
  };
};

// Hook for xenbox operations
export const useXenbox = () => {
  // Mutation for deleting xenbox file
  const { mutate: deleteFile, isPending: isDeleting } = useMutation({
    mutationFn: deleteXenboxFile,
  });

  // Mutation for cancelling upload
  const { mutate: cancelUploadMutation } = useMutation({
    mutationFn: cancelUpload,
  });

  return {
    deleteFile: (fileId: string) => deleteFile(fileId),
    isDeleting,
    cancelUpload: (uploadId: string) => cancelUploadMutation(uploadId),
  };
};
