import { ReactNode } from 'react'
import { NativeSyntheticEvent } from 'react-native'

export type EaseType = 'default' | 'linear' | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'

export interface SwiperProps {
  children?: ReactNode;
  circular?: boolean;
  current?: number;
  interval?: number;
  autoplay?: boolean;
  duration?: number;
  'indicator-dots'?: boolean;
  'indicator-color'?: string;
  'indicator-active-color'?: string;
  vertical?: boolean;
  style: {
    [key: string]: any
  };
  'easing-function'?: EaseType;
  'previous-margin'?: string;
  'next-margin'?: string;
  'enable-offset'?: boolean;
  'enable-var': boolean;
  'parent-font-size'?: number;
  'parent-width'?: number;
  'parent-height'?: number;
  'external-var-context'?: Record<string, any>;
  bindchange?: (event: NativeSyntheticEvent<TouchEvent> | unknown) => void;
}

export interface CarouseProps {
  children?: ReactNode;
  circular?: boolean;
  current: number;
  autoplay?: boolean;
  duration?: number;
  interval?: number;
  showsPagination?: boolean;
  dotColor?: string;
  activeDotColor?: string;
  horizontal?: boolean;
  easingFunction?: EaseType;
  previousMargin?: number;
  nextMargin?: number;
  enableOffset?: boolean;
  parentFontSize?: number;
  parentWidth?: number;
  parentHeight?: number;
  bindchange?: (event: NativeSyntheticEvent<TouchEvent> | unknown) => void;
  getInnerLayout: Function;
  innerProps: Object;
  style: {
    [key: string]: any
  };
  enableVar: boolean;
  externalVarContext?: Record<string, any>;
}

export interface CarouseState {
  children: Array<ReactNode> | ReactNode,
  width: number;
  height: number;
  index: number;
  total: number;
  // 设置scrollView初始的滚动坐标，contentOffset
  offset: {
    x: number,
    y: number
  };
  // 是否结束自动轮播，手动设置滚动到具体位置时结束
  autoplayEnd: boolean;
  loopJump: boolean;
  dir: 'x' | 'y';
  isScrollEnd: boolean
}

export interface ScrollElementProps {
  pagingEnabled: boolean,
  showsHorizontalScrollIndicator: boolean,
  showsVerticalScrollIndicator: boolean,
  bounces: boolean,
  scrollsToTop: boolean,
  removeClippedSubviews: boolean,
  automaticallyAdjustContentInsets: boolean,
  horizontal: boolean
}
