import { computed, ComputedRef, reactive, ref, Ref, shallowReadonly, watch } from "vue";
import { Editor, Graph, GraphTemplate } from "@baklavajs/core";

import { gridBackgroundProvider } from "./editor/backgroundProvider";
import { ICommandHandler, useCommandHandler } from "./commands";
import { IClipboard, useClipboard } from "./clipboard";
import { IHistory, useHistory } from "./history";
import { registerGraphCommands } from "./graph";
import { useSwitchGraph } from "./graph/switchGraph";
import { IViewNodeState, setViewNodeProperties } from "./node/viewNode";
import { SubgraphInputNode, SubgraphOutputNode } from "./graph/subgraphInterfaceNodes";

export interface IViewSettings {
    /** Use straight connections instead of bezier curves */
    useStraightConnections: boolean;
    /** Show a minimap */
    enableMinimap: boolean;
}

export interface IBaklavaView {
    editor: Ref<Editor>;
    displayedGraph: Ref<Graph>;
    isSubgraph: Readonly<Ref<boolean>>;
    settings: IViewSettings;
    backgroundStyles: ComputedRef<Record<string, any>>;
    commandHandler: ICommandHandler;
    history: IHistory;
    clipboard: IClipboard;
    switchGraph: (newGraph: Graph | GraphTemplate) => void;
}

export function useBaklava(editor: Ref<Editor>): IBaklavaView {
    const token = Symbol("ViewPluginToken");

    const _displayedGraph = ref(null as any) as Ref<Graph>;
    const displayedGraph = shallowReadonly(_displayedGraph) as Readonly<Ref<Graph>>;
    const { switchGraph } = useSwitchGraph(editor, _displayedGraph);

    const isSubgraph = computed(() => displayedGraph.value && displayedGraph.value !== editor.value.graph);

    const settings: IViewSettings = reactive({
        useStraightConnections: false,
        enableMinimap: false,
    });

    const backgroundStyles: ComputedRef<Record<string, any>> = gridBackgroundProvider(displayedGraph, {
        gridSize: 100,
        gridDivision: 5,
        subGridVisibleThreshold: 0.6,
    });

    const commandHandler = useCommandHandler();
    const history = useHistory(displayedGraph, commandHandler);
    const clipboard = useClipboard(displayedGraph, editor, commandHandler);

    registerGraphCommands(displayedGraph, commandHandler, switchGraph);

    watch(
        editor,
        (newValue, oldValue) => {
            if (oldValue) {
                oldValue.events.registerGraph.unsubscribe(token);
                oldValue.graphEvents.beforeAddNode.unsubscribe(token);
                newValue.nodeHooks.beforeLoad.unsubscribe(token);
                newValue.nodeHooks.afterSave.unsubscribe(token);
            }
            if (newValue) {
                newValue.nodeHooks.beforeLoad.subscribe(token, (state, node) => {
                    node.position = (state as IViewNodeState).position ?? { x: 0, y: 0 };
                    node.width = (state as IViewNodeState).width ?? 200;
                    node.twoColumn = (state as IViewNodeState).twoColumn ?? false;
                    return state;
                });
                newValue.nodeHooks.afterSave.subscribe(token, (state, node) => {
                    (state as IViewNodeState).position = node.position;
                    (state as IViewNodeState).width = node.width;
                    (state as IViewNodeState).twoColumn = node.twoColumn;
                    return state;
                });

                newValue.graphEvents.beforeAddNode.subscribe(token, (node) => setViewNodeProperties(node));

                editor.value.registerNodeType(SubgraphInputNode, { category: "Subgraphs" });
                editor.value.registerNodeType(SubgraphOutputNode, { category: "Subgraphs" });

                switchGraph(newValue.graph);
            }
        },
        { immediate: true }
    );

    return {
        editor,
        displayedGraph,
        isSubgraph,
        settings,
        backgroundStyles,
        commandHandler,
        history,
        clipboard,
        switchGraph,
    };
}