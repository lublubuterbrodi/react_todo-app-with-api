import React, { useEffect, useState, useRef, useCallback } from 'react';
import classNames from 'classnames';

import { Header } from './components/header';
import { TodoList } from './components/todolist';
import { Footer } from './components/footer';
import { ErrorNotification } from './components/error';

import {
  USER_ID,
  getTodos,
  addTodo,
  deleteTodo,
  updateTodo,
} from './api/todos';

import { Todo } from './types/todo';
import { FilterType } from './enums/filter';

export const App: React.FC = () => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>(FilterType.All);

  const [savingIds, setSavingIds] = useState<number[]>([]);
  const [tempTodo, setTempTodo] = useState<Todo | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // авто-скрытие ошибки через 3 сек
  const hideErrorTimer = useRef<number | null>(null);

  const clearError = useCallback(() => {
    if (hideErrorTimer.current !== null) {
      window.clearTimeout(hideErrorTimer.current);
      hideErrorTimer.current = null;
    }

    setErrorMsg(null);
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    if (hideErrorTimer.current !== null) {
      window.clearTimeout(hideErrorTimer.current);
    }

    hideErrorTimer.current = window.setTimeout(() => {
      setErrorMsg(null);
      hideErrorTimer.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (hideErrorTimer.current !== null) {
        window.clearTimeout(hideErrorTimer.current);
      }
    };
  }, []);

  const loadTodos = useCallback(async () => {
    setLoading(true);
    clearError();
    try {
      const data = await getTodos(); // без аргумента

      setTodos(data);
    } catch {
      showError('Unable to load todos');
    } finally {
      setLoading(false);
    }
  }, [clearError, showError]);

  useEffect(() => {
    if (USER_ID) {
      loadTodos();
    }

    inputRef.current?.focus();
  }, [loadTodos]);

  // снимаем tempTodo, когда он появился в основном списке
  useEffect(() => {
    if (!tempTodo) {
      return;
    }

    const exists = todos.some(t => t.id === tempTodo.id);

    if (exists) {
      setTempTodo(null);
    }
  }, [todos, tempTodo]);

  // фильтрация
  const filteredTodos = todos.filter(todo => {
    switch (filter) {
      case FilterType.Active:
        return !todo.completed;
      case FilterType.Completed:
        return todo.completed;
      default:
        return true;
    }
  });

  const activeCount = todos.filter(t => !t.completed).length;
  const completedCount = todos.length - activeCount;
  const hasTodos = todos.length > 0;
  const allCompleted = hasTodos && todos.every(t => t.completed);

  // Добавление новой задачи — возвращаем успех/провал
  const handleAddTodo = async (title: string): Promise<boolean> => {
    const trimmed = title.trim();

    if (!trimmed) {
      showError('Title should not be empty');

      return false;
    }

    clearError();

    const optimisticTodo: Todo = {
      id: 0,
      userId: USER_ID,
      title: trimmed,
      completed: false,
    };

    setTempTodo(optimisticTodo);

    try {
      const created = await addTodo(trimmed); // строка, не объект

      // кладём в конец, чтобы занять место tempTodo
      setTodos(prev => [...prev, created]);

      return true;
    } catch {
      showError('Unable to add a todo');

      return false;
    } finally {
      setTempTodo(null);
    }
  };

  const handleToggleTodo = async (todo: Todo) => {
    clearError();
    setSavingIds(ids => [...ids, todo.id]);
    try {
      const updated = await updateTodo({ ...todo, completed: !todo.completed });

      setTodos(prev => prev.map(t => (t.id === todo.id ? updated : t)));
    } catch {
      showError('Unable to update a todo');
    } finally {
      setSavingIds(ids => ids.filter(id => id !== todo.id));
    }
  };

  // Удаление одной задачи — возвращаем успех/провал и фокусим поле
  const handleRemoveTodo = async (id: number): Promise<boolean> => {
    clearError();
    setSavingIds(ids => [...ids, id]);

    try {
      await deleteTodo(id);
      setTodos(prev => prev.filter(t => t.id !== id));
      inputRef.current?.focus();

      return true;
    } catch {
      showError('Unable to delete a todo');

      return false;
    } finally {
      setSavingIds(ids => ids.filter(x => x !== id));
    }
  };

  // Обновление заголовка для редактирования — возвращаем успех/провал
  const handleUpdateTitle = async (
    id: number,
    nextTitle: string,
  ): Promise<boolean> => {
    const todo = todos.find(t => t.id === id);

    if (!todo) {
      return false;
    }

    const trimmed = nextTitle.trim();

    if (trimmed === '') {
      // пустой => удалить
      const ok = await handleRemoveTodo(id);

      return ok;
    }

    if (trimmed === todo.title) {
      // нет изменений — считаем успехом (закрыть редактирование)
      return true;
    }

    clearError();
    setSavingIds(ids => [...ids, id]);

    try {
      const updated = await updateTodo({ ...todo, title: trimmed });

      setTodos(prev => prev.map(t => (t.id === id ? updated : t)));

      return true;
    } catch {
      showError('Unable to update a todo');

      return false;
    } finally {
      setSavingIds(ids => ids.filter(x => x !== id));
    }
  };

  const handleToggleAll = async () => {
    if (todos.length === 0) {
      return;
    }

    clearError();

    const shouldCompleteAll = todos.some(t => !t.completed);

    const prevTodos = todos;

    setTodos(prev => prev.map(t => ({ ...t, completed: shouldCompleteAll })));
    setLoading(true);

    try {
      for (const t of prevTodos) {
        if (t.completed !== shouldCompleteAll) {
          await updateTodo({ ...t, completed: shouldCompleteAll });
        }
      }
    } catch {
      setTodos(prevTodos);
      showError('Unable to toggle all todos');
    } finally {
      setLoading(false);
    }
  };

  // Групповое удаление завершённых — параллельно, показываем нужный текст ошибки и возвращаем фокус
  const handleClearCompleted = async () => {
    clearError();
    const completed = todos.filter(t => t.completed);

    if (completed.length === 0) {
      return;
    }

    setLoading(true);

    const prevTodos = todos;

    // оптимистично скрываем завершённые
    setTodos(prev => prev.filter(t => !t.completed));

    try {
      const results = await Promise.allSettled(
        completed.map(t => deleteTodo(t.id)),
      );

      const statusById = new Map<number, 'fulfilled' | 'rejected'>();

      results.forEach((res, i) => {
        statusById.set(completed[i].id, res.status);
      });

      const hasFail = results.some(r => r.status === 'rejected');

      if (hasFail) {
        // в списке остаются только те completed, которые НЕ удалились
        setTodos(() =>
          prevTodos.filter(
            t => !(t.completed && statusById.get(t.id) === 'fulfilled'),
          ),
        );
        // текст ошибки должен совпасть с ожиданием теста
        showError('Unable to delete a todo');
      }
    } finally {
      setLoading(false);
      // вернуть фокус после скрытия оверлея
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  return (
    <div className="todoapp">
      <h1 className="todoapp__title">todos</h1>

      <div className="todoapp__content">
        <Header
          hasTodos={hasTodos}
          allCompleted={allCompleted}
          onToggleAll={handleToggleAll}
          onAddTodo={handleAddTodo} // Promise<boolean>
          inputRef={inputRef}
          disabled={!!tempTodo}
        />

        {(hasTodos || tempTodo) && (
          <>
            <TodoList
              todos={[...filteredTodos, ...(tempTodo ? [tempTodo] : [])]}
              savingIds={savingIds}
              onToggleTodo={handleToggleTodo}
              onRemoveTodo={handleRemoveTodo}
              onUpdateTitle={handleUpdateTitle} // Promise<boolean>
              tempTodoId={tempTodo ? 0 : null}
            />

            <Footer
              activeCount={activeCount}
              completedCount={completedCount}
              filter={filter}
              setFilter={setFilter}
              onClearCompleted={handleClearCompleted}
            />
          </>
        )}

        <ErrorNotification
          errorMsg={errorMsg}
          onClose={() => setErrorMsg(null)}
        />

        <div
          data-cy="LoadingOverlay"
          className={classNames('modal overlay', { 'is-active': loading })}
        >
          <div className="modal-background has-background-white-ter" />
          <div className="loader" />
        </div>
      </div>
    </div>
  );
};
