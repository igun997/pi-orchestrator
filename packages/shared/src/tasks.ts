import type { Task } from "./schemas.js";

export function getReadyTasks(tasks: Task[]): Task[] {
  const complete = new Set(tasks.filter((task) => task.status === "complete" || task.status === "skipped").map((task) => task.id));
  return tasks.filter((task) => task.status === "pending" && task.deps.every((dep) => complete.has(dep)));
}

export function markTaskComplete(tasks: Task[], id: string): Task[] {
  return tasks.map((task) => (task.id === id ? { ...task, status: "complete" } : task));
}

export function markTaskFailed(tasks: Task[], id: string, errorRef: string): Task[] {
  return tasks.map((task) => (task.id === id ? { ...task, status: "failed", errorRef } : task));
}

export function resetTask(tasks: Task[], id: string): Task[] {
  return tasks.map((task) => (task.id === id ? { ...task, status: "pending", errorRef: undefined } : task));
}
