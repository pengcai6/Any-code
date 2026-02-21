/**
 * Task Management Widgets - Claude Code 任务管理工具
 *
 * 核心组件：TaskListAggregateWidget
 * 通过 useMessagesContext 扫描所有消息，从 TaskCreate/TaskUpdate 的
 * tool_use (assistant消息) 和 tool_result (user消息) 中重建完整任务列表
 *
 * 数据流：
 * - assistant 消息 content[]: { type: "tool_use", name: "TaskCreate", id: "tooluse_xxx", input: { subject, description } }
 * - user 消息 content[]: { type: "tool_result", tool_use_id: "tooluse_xxx", content: "Task #1 created..." }
 * - user 消息顶层: toolUseResult: { task: { id: "1", subject: "..." } }
 */

import React from "react";
import { CheckCircle2, Clock, Circle, Trash2, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useMessagesContext } from "@/contexts/MessagesContext";

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
}

// ============================================================================
// 从所有消息中重建任务列表
// ============================================================================

function buildTaskListFromMessages(messages: any[]): TaskItem[] {
  const tasks = new Map<string, TaskItem>();
  // toolUseId → { subject, description } 映射（从 assistant 的 tool_use 中提取）
  const toolUseInputs = new Map<string, { subject: string; description?: string }>();
  // 暂存 TaskUpdate 操作，第二遍再应用
  const pendingUpdates: Array<{ taskId: string; status?: string; subject?: string }> = [];

  // === 第一遍：收集 TaskCreate inputs + tool_results，建立任务 ===
  for (const msg of messages) {
    const content = msg?.message?.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      // 从 assistant 消息中提取 TaskCreate 的 input
      if (block.type === 'tool_use' && /^TaskCreate$/i.test(block.name)) {
        const input = block.input || {};
        if (input.subject) {
          toolUseInputs.set(block.id, {
            subject: input.subject,
            description: input.description,
          });
        }
      }

      // 暂存 TaskUpdate 操作
      if (block.type === 'tool_use' && /^TaskUpdate$/i.test(block.name)) {
        const input = block.input || {};
        const taskId = input.taskId ? String(input.taskId) : '';
        if (taskId) {
          pendingUpdates.push({
            taskId,
            status: input.status,
            subject: input.subject,
          });
        }
      }

      // 从 user 消息的 tool_result 中提取 taskId，建立任务
      if (block.type === 'tool_result' && block.tool_use_id) {
        const toolUseId = block.tool_use_id;
        const inputData = toolUseInputs.get(toolUseId);
        if (inputData) {
          let taskId: string | null = null;
          const contentStr = typeof block.content === 'string' ? block.content : '';
          const match = contentStr.match(/Task #(\d+)/);
          if (match) taskId = match[1];

          if (!taskId && msg.toolUseResult?.task?.id) {
            taskId = String(msg.toolUseResult.task.id);
          }

          if (taskId) {
            tasks.set(taskId, {
              id: taskId,
              subject: inputData.subject,
              status: 'pending',
              description: inputData.description,
            });
            toolUseInputs.delete(toolUseId);
          }
        }
      }
    }
  }

  // 处理没有匹配到 tool_result 的 TaskCreate（还在执行中）
  let autoId = tasks.size > 0
    ? Math.max(...Array.from(tasks.keys()).map(Number).filter(n => !isNaN(n))) + 1
    : 1;
  for (const [, inputData] of toolUseInputs) {
    tasks.set(String(autoId), {
      id: String(autoId),
      subject: inputData.subject,
      status: 'pending',
      description: inputData.description,
    });
    autoId++;
  }

  // === 第二遍：应用 TaskUpdate 操作 ===
  for (const update of pendingUpdates) {
    const existing = tasks.get(update.taskId);
    if (existing) {
      if (update.status) existing.status = update.status;
      if (update.subject) existing.subject = update.subject;
    } else {
      tasks.set(update.taskId, {
        id: update.taskId,
        subject: update.subject || `任务 #${update.taskId}`,
        status: update.status || 'pending',
      });
    }
  }

  return Array.from(tasks.values())
    .sort((a, b) => Number(a.id) - Number(b.id));
}

// ============================================================================
// 导出类型（兼容 ToolCallsGroup）
// ============================================================================

export interface TaskToolCall {
  name: string;
  input: any;
  result?: any;
  id?: string;
}

export interface TaskListAggregateWidgetProps {
  toolCalls: TaskToolCall[];
}

export const TaskListAggregateWidget: React.FC<TaskListAggregateWidgetProps> = () => {
  const { messages } = useMessagesContext();

  const tasks = React.useMemo(
    () => buildTaskListFromMessages(messages),
    [messages]
  );

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const inProgressCount = tasks.filter(t => t.status === 'in_progress').length;
  const totalCount = tasks.length;

  if (totalCount === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ListTodo className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">任务列表</span>
        <Badge variant="outline" className="text-xs">
          {completedCount}/{totalCount}
        </Badge>
        {inProgressCount > 0 && (
          <Badge variant="outline" className="text-xs bg-info/10 text-info border-info/20">
            {inProgressCount} 进行中
          </Badge>
        )}
      </div>
      <div className="space-y-1">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={cn(
              "flex items-start gap-2.5 px-3 py-2 rounded-md border bg-card/50",
              task.status === "completed" && "opacity-60",
              task.status === "deleted" && "opacity-40"
            )}
          >
            <div className="mt-0.5 shrink-0">
              {statusIcons[task.status] || statusIcons.pending}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm leading-snug",
                task.status === "completed" && "line-through text-muted-foreground"
              )}>
                {task.subject}
              </p>
              {task.description && task.status === 'pending' && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {task.description}
                </p>
              )}
            </div>
            <span className={cn(
              "text-xs shrink-0 mt-0.5",
              task.status === "completed" ? "text-success" :
              task.status === "in_progress" ? "text-info" :
              "text-muted-foreground"
            )}>
              {statusLabels[task.status] || task.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// 单独的 Widget 导出（兼容 toolRegistryInit 注册）
// 实际渲染由 TaskListAggregateWidget 在 ToolCallsGroup 中接管
// ============================================================================

export interface TaskCreateWidgetProps {
  subject?: string; description?: string; activeForm?: string; result?: any;
}
export const TaskCreateWidget: React.FC<TaskCreateWidgetProps> = () => null;

export interface TaskUpdateWidgetProps {
  taskId?: string; status?: string; subject?: string;
  description?: string; activeForm?: string; result?: any;
}
export const TaskUpdateWidget: React.FC<TaskUpdateWidgetProps> = () => null;

export interface TaskListWidgetProps { result?: any; }
export const TaskListWidget: React.FC<TaskListWidgetProps> = () => null;

export interface TaskGetWidgetProps { taskId?: string; result?: any; }
export const TaskGetWidget: React.FC<TaskGetWidgetProps> = () => null;
