import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "../useSocket";
import { invalidateItemDerived } from "./invalidate";

/**
 * Keeps an open book in sync with edits made by other members. This is what makes the
 * monthly tally live: the server emits after every mutation, and every member's open
 * Overview re-fetches its summary.
 */
export function useXenBudgetSocket(bookId: string) {
    const { socket } = useSocket();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!socket) return;

        const handleBookUpdate = (data: { bookId: string }) => {
            if (data.bookId !== bookId) return;
            invalidateItemDerived(queryClient, bookId);
        };

        socket.on("xenbudget:book_update", handleBookUpdate);
        return () => {
            socket.off("xenbudget:book_update", handleBookUpdate);
        };
    }, [socket, bookId, queryClient]);
}

export function useXenBudgetBooksSocket() {
    const { socket } = useSocket();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!socket) return;

        const handleBooksUpdated = () => {
            queryClient.invalidateQueries({ queryKey: ["xenbudget", "books"] });
        };

        socket.on("xenbudget:books_updated", handleBooksUpdated);
        return () => {
            socket.off("xenbudget:books_updated", handleBooksUpdated);
        };
    }, [socket, queryClient]);
}
