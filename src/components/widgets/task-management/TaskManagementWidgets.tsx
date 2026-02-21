/**
 * Task Management Widgets - Claude Code 任务管理工具
 *
 * 核心组件：TaskListAggregateWidget
 * 从同一消息中的多个 TaskCreate/TaskUpdate/TaskList/TaskGet 工具调用
 * 聚合重建完整的任务列表状态，渲染为统一的任务面板
 */

import React from "react";
import { CheckCircle2, Clock, Circle, Trash2, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusIcons: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="h-4 w-4 text-success" />,
  in_progress: <Clock className="h-4 w-4 text-info animate-pulse" />,
  pending: <Circle className="h-4 w-4 text-muted-foreground" />,
  deleted: <Trash2 className="h-4 w-4 text-destructive" />,
};

const statusLabels: Record<string, string> = {
  completed: "已完成",
  in_progress: "进行中",
  pending: "待处理",
  deleted: "已删除",
};

interface TaskItem {
  id: string;
  subject: string;
  status: string;
  description?: string;
  activeForm?: string;
}

// 模块级任务状态表，跨消息持久化
// key: taskId, value: TaskItem
const globalTaskStore = new Map<string, TaskItem>();

// ============================================================================
// 工具调用数据结构
// ============================================================================

export interface TaskToolCall {
  name: string;       // "TaskCreate" | "TaskUpdate" | "TaskList" | "TaskGet"
  input: any;         // tool_use.input
  result?: any;       // normalizedResult (含 sourceMessage)
  id?: string;        // tool_use.id
}

// ============================================================================
// TaskListAggregateWidget - 聚合渲染任务列表
// ============================================================================

export interface TaskListAggregateWidgetProps {
  toolCalls: TaskToolCall[];
}

/**
 * 从 tool_use 和 tool_result 中重建任务列表状态
 */
function buildTaskList(toolCalls: TaskToolCall[]): TaskItem[] {
  // 先处理 TaskCreate，再处理 TaskUpdate
  const creates = toolCalls.filter(t => /^TaskCreate$/i.test(t.name));
  const updates = toolCalls.filter(t => /^TaskUpdate$/i.test(t.name));

  // 处理 TaskCreate
  for (const tc of creates) {
    const subject = tc.input?.subject || '';
    const description = tc.input?.description;
    const activeForm = tc.input?.activeForm;

    // 从 result 中提取 taskId
    let taskId = '';
    const toolUseResult = tc.result?.sourceMessage?.toolUseResult;
    if (toolUseResult?.task?.id) {
      taskId = String(toolUseResult.task.id);
    } else if (typeof tc.result?.content === 'string') {
      const match = tc.result.content.match(/Task #(\d+)/);
      if (match) taskId = match[1];
    }

    if (taskId && subject) {
      const task: TaskItem = {
        id: taskId,
        subject,
        status: 'pending',
        description,
        activeForm,
      };
      globalTaskStore.set(taskId, task);
    }
  }

  // 处理 TaskUpdate
  for (const tc of updates) {
    const taskId = tc.input?.taskId ? String(tc.input.taskId) : '';
    const newStatus = tc.input?.status;
    const newSubject = tc.input?.subject;

    if (taskId) {
      const existing = globalTaskStore.get(taskId);
      if (existing) {
        if (newStatus) existing.status = newStatus;
        if (newSubject) existing.subject = newSubject;
      } else {
        // TaskCreate 可能在之前的消息中，globalTaskStore 已有
        // 如果没有，创建一个占位
        globalTaskStore.set(taskId, {
          id: taskId,
          subject: newSubject || `任务 #${taskId}`,
          status: newStatus || 'pending',
        });
      }
    }
  }

  // 返回所有已知任务，按 id 排序
  return Array.from(globalTaskStore.values())
    .sort((a, b) => Number(a.id) - Number(b.id));
}

export const TaskListAggregateWidget: React.FC<TaskListAggregateWidgetProps> = ({
  toolCalls,
}) => {
  const tasks = React.useMemo(() => buildTaskList(toolCalls), [toolCalls]);

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <ListTodo className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">任务列表</span>
        <Badge variant="outline" className="text-xs">
          {completedCount}/{totalCount}
        </Badge>
      </div>
      <div className="space-y-1.5">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              "flex items-start gap-3 p-2.5 rounded-lg border bg-card/50",
              task.status === "completed" && "opacity-60"
            )}
          >
            <div className="mt-0.5">
              {statusIcons[task.status] || statusIcons.pending}
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className={cn(
                "text-sm",
                task.status === "completed" && "line-through"
              )}>
                {task.subject}
              </p>
              {task.description && task.status !== 'completed' && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {task.description}
                </p>
              )}
            </div>
            <Badge
              variant="outline"
              className={cn("text-xs shrink-0", {
                "bg-success/10 text-success border-success/20": task.status === "completed",
                "bg-info/10 text-info border-info/20": task.status === "in_progress",
                "bg-muted/10 text-muted-foreground border-muted/20": task.status === "pending",
                "bg-destructive/10 text-destructive border-destructive/20": task.status === "deleted",
              })}
            >
              {statusLabels[task.status] || task.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 单独的 Widget（用于 toolRegistryInit 注册，但实际渲染由聚合组件接管）
// 保留导出以兼容 index.ts
// ============================================================================

export interface TaskCreateWidgetProps {
  subject?: string;
  description?: string;
  activeForm?: string;
  result?: any;
}
export const TaskCreateWidget: React.FC<TaskCreateWidgetProps> = () => null;

export interface TaskUpdateWidgetProps {
  taskId?: string;
  status?: string;
  subject?: string;
  description?: string;
  activeForm?: string;
  result?: any;
}
export const TaskUpdateWidget: React.FC<TaskUpdateWidgetProps> = () => null;

export interface TaskListWidgetProps { result?: any; }
export const TaskListWidget: React.FC<TaskListWidgetProps> = () => null;

export interface TaskGetWidgetProps { taskId?: string; result?: any; }
export const TaskGetWidget: React.FC<TaskGetWidgetProps> = () => null;
