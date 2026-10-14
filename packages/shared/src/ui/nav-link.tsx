"use client";

import Link from "next/link";
import { forwardRef, type MouseEvent, type ReactNode } from "react";
import { useNavigation } from "../navigation/navigation-provider";
import {
  isNavItemActive,
  type ActiveMatch,
} from "../navigation/navigation-state";

export interface NavLinkRenderState {
  active: boolean;
  pending: boolean;
}

export interface NavLinkProps {
  href: string;
  activeMatch?: ActiveMatch;
  className?: string | ((state: NavLinkRenderState) => string);
  children: ReactNode | ((state: NavLinkRenderState) => ReactNode);
  target?: string;
  rel?: string;
  title?: string;
  "aria-label"?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
  /** Skip hover prefetching (e.g. expensive or rarely-visited destinations). */
  noPrefetch?: boolean;
}

const isExternal = (href: string) => /^([a-z][a-z0-9+.-]*:)?\/\//i.test(href);

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  function NavLink(
    {
      href,
      activeMatch,
      className,
      children,
      target,
      rel,
      title,
      "aria-label": ariaLabel,
      onClick,
      noPrefetch,
    },
    ref,
  ) {
    const { pathname, pendingHref, navigate, prefetch } = useNavigation();
    const active = isNavItemActive(
      { pathname, pendingHref },
      href,
      activeMatch,
    );
    const pending = pendingHref === href;
    const state: NavLinkRenderState = { active, pending };

    const external = isExternal(href) || target === "_blank";

    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || external) return;
      // Let the browser handle modified clicks (new tab/window) and non-primary
      // buttons exactly as it would for a plain anchor.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)
        return;
      e.preventDefault();
      navigate(href);
    };

    const warm = () => {
      if (!external && !noPrefetch) prefetch(href);
    };

    return (
      <Link
        ref={ref}
        href={href}
        target={target}
        rel={rel}
        title={title}
        aria-label={ariaLabel}
        // Next's own prefetch is redundant with our hover-triggered one and
        // would fire for every sidebar item on viewport entry.
        prefetch={false}
        onClick={handleClick}
        onMouseEnter={warm}
        onFocus={warm}
        aria-current={active ? "page" : undefined}
        data-active={active ? "" : undefined}
        data-pending={pending ? "" : undefined}
        className={
          typeof className === "function" ? className(state) : className
        }
      >
        {typeof children === "function" ? children(state) : children}
      </Link>
    );
  },
);
