/**
 * Task Management Widgets - Claude Code 任务管理工具
 *
 * 支持 TaskCreate, TaskUpdate, TaskList, TaskGet 工具的渲染
 * 与 TodoWidget 风格保持一致
 */

import React from "react";
import { CheckCircle2, Clock, Circle, Plus, List, Eye, Trash2 } from "lucide-react";
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

const statusColors: Record<string, string> = {
  completed: "bg-success/10 text-success border-success/20",
  in_progress: "bg-info/10 text-info border-info/20",
  pending: "bg-muted/10 text-muted-foreground border-muted/20",
  deleted: "bg-destructive/10 text-destructive border-destructive/20",
};

// ============================================================================
// TaskCreate Widget
// ============================================================================

export interface TaskCreateWidgetProps {
  subject?: string;
  description?: string;
  activeForm?: string;
  result?: any;
}

export const TaskCreateWidget: React.FC<TaskCreateWidgetProps> = ({
  subject,
  description,
}) => {
  return (
    <div className="flex items-start gap-3 p-2.5 rounded-lg border bg-card/50">
      <div className="mt-0.5">
        <Plus className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        {subject && (
          <p className="text-sm truncate">{subject}</p>
        )}
        {description && (
          <p className="text-xs text-muted-foreground truncate">
            {description}
          </p>
        )}
      </div>
      <Badge variant="outline" className={cn("text-xs shrink-0", statusColors.pending)}>
        {statusLabels.pending}
      </Badge>
    </div>
  );
};

// ============================================================================
// TaskUpdate Widget
// ============================================================================

export interface TaskUpdateWidgetProps {
  taskId?: string;
  status?: string;
  subject?: string;
  description?: string;
  activeForm?: string;
  result?: any;
}

export const TaskUpdateWidget: React.FC<TaskUpdateWidgetProps> = ({
  taskId,
  status,
  subject,
  activeForm,
  result,
}) => {
  const displayStatus = status || "pending";

  // Try to extract subject from result's sourceMessage.toolUseResult
  let displaySubject = subject || activeForm;
  if (!displaySubject && result?.sourceMessage?.toolUseResult?.task?.subject) {
    displaySubject = result.sourceMessage.toolUseResult.task.subject;
  }

  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border bg-card/50">
      <div>
        {statusIcons[displayStatus] || statusIcons.pending}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {taskId && (
          <span className="text-xs text-muted-foreground shrink-0">#{taskId}</span>
        )}
        {displaySubject && (
          <p className="text-sm truncate">{displaySubject}</p>
        )}
      </div>
      <Badge
        variant="outline"
        className={cn("text-xs shrink-0", statusColors[displayStatus])}
      >
        {statusLabels[displayStatus] || displayStatus}
      </Badge>
    </div>
  );
};

// ============================================================================
// TaskList Widget
// ============================================================================

export interface TaskListWidgetProps {
  result?: any;
}

export const TaskListWidget: React.FC<TaskListWidgetProps> = () => {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-card/50">
      <List className="h-4 w-4 text-primary" />
      <span className="text-sm text-muted-foreground">查看任务列表</span>
    </div>
  );
};

// ============================================================================
// TaskGet Widget
// ============================================================================

export interface TaskGetWidgetProps {
  taskId?: string;
  result?: any;
}

export const TaskGetWidget: React.FC<TaskGetWidgetProps> = ({ taskId }) => {
  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-card/50">
      <Eye className="h-4 w-4 text-primary" />
      <span className="text-sm text-muted-foreground">查看任务</span>
      {taskId && (
        <Badge variant="outline" className="text-xs">#{taskId}</Badge>
      )}
    </div>
  );
};
