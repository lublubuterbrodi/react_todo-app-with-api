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
  const [newTitle, setNewTitle] = useState('');
  const [tempTodo, setTempTodo] = useState<Todo | null>(null);
  const [savingIds, setSavingIds] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const errorTimeoutRef = useRef<number>();

  const showError = useCallback((msg: string) => {
    clearTimeout(errorTimeoutRef.current);
    setErrorMsg(null);
    setTimeout(() => setErrorMsg(msg), 0);
    errorTimeoutRef.current = window.setTimeout(() => {
      setErrorMsg(null);
      setTempTodo(null);
    }, 3000);
  }, []);

  const clearError = useCallback(() => {
    clearTimeout(errorTimeoutRef.current);
    setErrorMsg(null);
  }, []);

  const loadTodos = useCallback(async () => {
    clearError();
    setLoading(true);
    try {
      const response = await getTodos();

      setTodos(response);
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

  useEffect(() => {
    if (!tempTodo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [tempTodo]);

  const handleAddTodo = async (title: string) => {
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      showError('Title should not be empty');

      return;
    }

    setTempTodo({
      id: 0,
      userId: USER_ID,
      title: trimmedTitle,
      completed: false,
    });
    setLoading(true);

    try {
      const newTodo = await addTodo(trimmedTitle);

      setTodos(prev => [...prev, newTodo]);
      setNewTitle('');
      setTempTodo(null);
      inputRef.current?.focus();
    } catch {
      showError('Unable to add a todo');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveTodo = async (id: number) => {
    clearError();
    setSavingIds(ids => [...ids, id]);
    try {
      await deleteTodo(id);
      setTodos(prev => prev.filter(t => t.id !== id));
      inputRef.current?.focus();
    } catch {
      showError('Unable to delete a todo');
      throw new Error();
    } finally {
      setSavingIds(ids => ids.filter(i => i !== id));
    }
  };

  const handleClearCompleted = async () => {
    clearError();
    const completedIds = todos
      .filter(todo => todo.completed)
      .map(todo => todo.id);

    setSavingIds(ids => [...ids, ...completedIds]);

    const results = await Promise.allSettled(
      completedIds.map(id => deleteTodo(id)),
    );

    let hasFailed = false;

    const successfulIds = completedIds.filter((_, index) => {
      const success = results[index].status === 'fulfilled';

      if (!success) {
        hasFailed = true;
      }

      return success;
    });

    if (hasFailed) {
      showError('Unable to delete a todo');
    }

    if (successfulIds.length > 0) {
      setTodos(prev => prev.filter(todo => !successfulIds.includes(todo.id)));
    }

    setSavingIds(ids => ids.filter(id => !completedIds.includes(id)));

    inputRef.current?.focus();
  };

  const handleToggleTodo = async (todo: Todo) => {
    clearError();
    setSavingIds(ids => [...ids, todo.id]);

    try {
      const updatedTodo = await updateTodo({
        ...todo,
        completed: !todo.completed,
      });

      setTodos(prev => prev.map(t => (t.id === todo.id ? updatedTodo : t)));
    } catch {
      showError('Unable to update a todo');
    } finally {
      setSavingIds(ids => ids.filter(id => id !== todo.id));
    }
  };

  const handleToggleAll = async () => {
    clearError();

    const allCompleted =
      todos.length > 0 && todos.every(todo => todo.completed);
    const newStatus = !allCompleted;

    const todosToUpdate = todos.filter(todo => todo.completed !== newStatus);

    if (todosToUpdate.length === 0) {
      return;
    }

    setSavingIds(ids => [...ids, ...todosToUpdate.map(t => t.id)]);

    const results = await Promise.allSettled(
      todosToUpdate.map(todo => updateTodo({ ...todo, completed: newStatus })),
    );

    let hasFailed = false;

    const updatedTodos = todos.map(todo => {
      const index = todosToUpdate.findIndex(t => t.id === todo.id);
      const result = results[index];

      if (index !== -1 && result.status === 'fulfilled') {
        return result.value;
      }

      if (index !== -1 && result.status === 'rejected') {
        hasFailed = true;
      }

      return todo;
    });

    if (hasFailed) {
      showError('Unable to update a todo');
    }

    setTodos(updatedTodos);
    setSavingIds(ids =>
      ids.filter(id => !todosToUpdate.some(todo => todo.id === id)),
    );
  };

  const handleSaveEdit = async () => {
    if (editingId === null) {
      return;
    }

    const todo = todos.find(t => t.id === editingId);

    if (!todo) {
      return;
    }

    const trimmedTitle = editingTitle.trim();

    if (trimmedTitle === '') {
      clearError();
      setSavingIds(ids => [...ids, todo.id]);

      let deleteSucceeded = false;

      try {
        await handleRemoveTodo(todo.id);
        deleteSucceeded = true;
      } catch {
        showError('Unable to delete a todo');
      } finally {
        setSavingIds(ids => ids.filter(id => id !== todo.id));
      }

      if (deleteSucceeded) {
        setEditingId(null);
      }

      return;
    }

    if (trimmedTitle === todo.title) {
      setEditingId(null);

      return; // ничего не менялось
    }

    clearError();
    setSavingIds(ids => [...ids, todo.id]);

    try {
      const updated = await updateTodo({ ...todo, title: trimmedTitle });

      setTodos(prev => prev.map(t => (t.id === todo.id ? updated : t)));
      setEditingId(null);
    } catch {
      showError('Unable to update a todo');
    } finally {
      setSavingIds(ids => ids.filter(id => id !== todo.id));
    }
  };

  const handleCancelEdit = () => {
    if (editingId === null) {
      return;
    }

    const original = todos.find(t => t.id === editingId);

    if (!original) {
      return;
    }

    setEditingTitle(original.title); // сбросить на старый
    setEditingId(null); // выйти из режима редактирования
  };

  const filteredTodos = todos.filter(todo => {
    if (filter === FilterType.Active) {
      return !todo.completed;
    }

    if (filter === FilterType.Completed) {
      return todo.completed;
    }

    return true;
  });

  const completedCount = todos.filter(t => t.completed).length;
  const activeCount = todos.length - completedCount;

  return (
    <div className="todoapp">
      {!USER_ID ? (
        <div>Please register user first</div>
      ) : (
        <>
          <h1 className="todoapp__title">todos</h1>

          <div className="todoapp__content">
            <Header
              todos={todos}
              loading={loading}
              allCompleted={
                todos.length > 0 && todos.every(todo => todo.completed)
              }
              onToggleAll={handleToggleAll}
              newTitle={newTitle}
              setNewTitle={setNewTitle}
              onAddTodo={handleAddTodo}
              clearError={clearError}
              inputRef={inputRef}
              disabled={!!tempTodo}
            />

            {(todos.length > 0 || tempTodo) && (
              <>
                <TodoList
                  todos={[...filteredTodos, ...(tempTodo ? [tempTodo] : [])]}
                  savingIds={savingIds}
                  editingId={editingId}
                  editingTitle={editingTitle}
                  onToggleTodo={handleToggleTodo}
                  onRemoveTodo={handleRemoveTodo}
                  onStartEdit={todo => {
                    setEditingId(todo.id);
                    setEditingTitle(todo.title);
                  }}
                  onSaveEdit={handleSaveEdit}
                  onCancelEdit={handleCancelEdit}
                  setEditingTitle={setEditingTitle}
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
          </div>

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
        </>
      )}
    </div>
  );
};
