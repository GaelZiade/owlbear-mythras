/**
 * Inline icons.
 *
 * Drawn rather than pulled from a font or a package: there is a handful of
 * them, they must inherit the Owlbear palette through `currentColor`, and an
 * icon dependency would outweigh the markup it saves.
 */

interface IconProps {
  size?: number;
}

function Icon({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const ChevronRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const ChevronDown = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

/** Defeated: unmistakably not a close or delete control. */
export const Skull = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 2.8c-4 0-7 2.9-7 6.7 0 2.2 1 3.6 2 4.5.5.5.8 1 .8 1.7v1.1c0 .7.6 1.2 1.3 1.2h5.8c.7 0 1.3-.5 1.3-1.2v-1.1c0-.7.3-1.2.8-1.7 1-.9 2-2.3 2-4.5 0-3.8-3-6.7-7-6.7Z" />
    <circle cx="9.3" cy="10.2" r="1.4" />
    <circle cx="14.7" cy="10.2" r="1.4" />
    <path d="M10.4 21.2v-2M13.6 21.2v-2" />
  </Icon>
);

export const Trash = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M10 7V5.5c0-.6.4-1 1-1h2c.6 0 1 .4 1 1V7" />
    <path d="M6.5 7l.8 12c0 .6.5 1 1 1h7.4c.5 0 1-.4 1-1l.8-12" />
  </Icon>
);

export const Dice = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </Icon>
);

export const Undo = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 9h10a5.5 5.5 0 0 1 0 11h-3" />
    <path d="M7.5 5.5 4 9l3.5 3.5" />
  </Icon>
);

export const Play = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 4.8 19 12 7 19.2z" />
  </Icon>
);

export const Stop = (props: IconProps) => (
  <Icon {...props}>
    <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" />
  </Icon>
);

export const AddToken = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10" cy="8" r="3.6" />
    <path d="M3.6 20c0-3.3 2.9-5.6 6.4-5.6 1 0 2 .2 2.8.6" />
    <path d="M18 13.5v7M14.5 17h7" />
  </Icon>
);

/** Add every token on the scene, as opposed to only the selected ones. */
export const AddAll = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="7.5" cy="7.5" r="2.7" />
    <circle cx="16.5" cy="7.5" r="2.7" />
    <path d="M3 19c0-2.7 2-4.4 4.5-4.4S12 16.3 12 19" />
    <path d="M12 19c0-2.7 2-4.4 4.5-4.4S21 16.3 21 19" />
  </Icon>
);

export const AddBlank = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const Info = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.5v.01" />
  </Icon>
);
