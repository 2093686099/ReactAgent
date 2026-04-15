"use client";

import { useCallback, useState, type RefObject } from "react";

type AutoScrollResult = {
  scrollToBottom: () => void;
  onScroll: () => void;
  shouldAutoScroll: boolean;
};

export function useAutoScroll(
  ref: RefObject<HTMLDivElement | null>
): AutoScrollResult {
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);

  const scrollToBottom = useCallback(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [ref]);

  const onScroll = useCallback(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const threshold = node.scrollHeight - node.scrollTop - node.clientHeight;
    setIsUserScrolledUp(threshold > 100);
  }, [ref]);

  return {
    scrollToBottom,
    onScroll,
    shouldAutoScroll: !isUserScrolledUp,
  };
}
