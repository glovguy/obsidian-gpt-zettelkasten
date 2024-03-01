import { useRef, useEffect } from 'react';
import { getIcon } from 'obsidian';

export const Icon = ({ svg }: { svg: SVGSVGElement | null }) => {
  const wrapperRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (wrapperRef.current && svg) {
      wrapperRef.current.appendChild(svg)
    }
  }, [])

  return <span ref={wrapperRef}></span>
}

export const CopyIcon = () => (<Icon svg={getIcon('copy')!} />);
