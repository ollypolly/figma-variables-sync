import React from "react";
import styles from "./Flex.module.css";

export interface FlexProps extends React.HTMLAttributes<HTMLDivElement> {
  direction?: "row" | "column";
  gap?: number | string;
  align?: React.CSSProperties["alignItems"];
  justify?: React.CSSProperties["justifyContent"];
  children?: React.ReactNode;
}

export const Flex: React.FC<FlexProps> = ({
  direction = "row",
  gap = 8,
  align,
  justify,
  style,
  className,
  children,
  ...props
}) => {
  const customStyle: React.CSSProperties = {
    flexDirection: direction,
    gap: typeof gap === "number" ? `${gap}px` : gap,
    alignItems: align,
    justifyContent: justify,
    ...style,
  };

  return (
    <div
      className={`${styles.flex} ${className || ""}`}
      style={customStyle}
      {...props}
    >
      {children}
    </div>
  );
};

// Simplified Semantic Wrappers
export const Stack: React.FC<Omit<FlexProps, "direction">> = (props) => (
  <Flex direction="column" {...props} />
);

export const Group: React.FC<Omit<FlexProps, "direction">> = ({
  align = "center",
  ...props
}) => <Flex direction="row" align={align} {...props} />;
