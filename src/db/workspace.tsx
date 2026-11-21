'use client';

import { createContext, useContext } from 'react';
import { db, type LiftLogDB } from './liftlog';

export const WorkspaceDatabase = createContext<LiftLogDB>(db);
export const useDatabase = () => useContext(WorkspaceDatabase);
