import React from 'react';

interface Props {
    onClose?: () => void;
    children?: React.ReactNode;
}

interface State {
    error: Error | null;
}

/**
 * Last line of defence for the Folia React island.
 *
 * If a visualizer throws during render (WebGL context loss, a shader failing
 * to compile, a bad cover URL, …) React unmounts the whole subtree. Without
 * this boundary that leaves an empty full-screen host div which still eats
 * every click, so the app looks frozen. Here we always render something: an
 * explanation plus a working exit button, and a "back to safe mode" action.
 */
export default class FoliaErrorBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('[Folia] visualizer crashed:', error, info.componentStack);
    }

    private readonly goSafe = () => {
        try {
            localStorage.setItem('visualizer_mode', 'classic');
            localStorage.setItem('visualizer_background_mode', 'common');
        } catch { /* storage may be unavailable */ }
        this.setState({ error: null });
    };

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;

        return (
            <div className="folia-overlay folia-fallback" role="alertdialog" aria-label="Folia 视觉渲染失败">
                <div className="folia-fallback-card">
                    <h2>视觉渲染失败</h2>
                    <p>当前模式需要 WebGL，而此环境未启用 GPU 加速（或显卡驱动被禁用）。其他功能不受影响。</p>
                    <pre>{error.message}</pre>
                    <div className="folia-fallback-actions">
                        <button type="button" onClick={this.goSafe}>切换到兼容模式</button>
                        <button type="button" onClick={this.props.onClose}>退出 Folia</button>
                    </div>
                </div>
            </div>
        );
    }
}

/**
 * A narrower boundary for the settings playground: its live preview can pick a
 * WebGL-only style even while the stage itself is on a safe mode. On failure we
 * keep the overlay and only replace the settings window with a small card.
 */
export class PlaygroundBoundary extends React.Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error) {
        console.error('[Folia] playground preview crashed:', error);
    }

    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div className="st-window folia-playground-error" role="alert">
                <strong>实时预览不可用</strong>
                <p>此环境未启用 WebGL，预览所需的 3D 渲染无法启动。样式设置仍会保存。</p>
                <div className="folia-fallback-actions">
                    <button type="button" onClick={() => this.setState({ error: null })}>重试</button>
                    <button type="button" onClick={this.props.onClose}>关闭设置</button>
                </div>
            </div>
        );
    }
}
