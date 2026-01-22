import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

import { SidebarComponent } from '../sidebar/sidebar.component';
import { DatasetHeaderComponent } from '../header/dataset-header.component';

/**
 * AppShell - Main layout wrapper component
 *
 * Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Sidebar  │  Header (DatasetHeader)                             │
 * │           ├─────────────────────────────────────────────────────┤
 * │           │                                                     │
 * │           │  Main Content (router-outlet)                       │
 * │           │                                                     │
 * └───────────┴─────────────────────────────────────────────────────┘
 */
@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, DatasetHeaderComponent],
  template: `
    <div class="h-screen flex bg-background">
      <app-sidebar
        [collapsedInput]="sidebarCollapsed()"
        (collapseChange)="onSidebarCollapse($event)"
      />
      <div class="flex-1 flex flex-col overflow-hidden">
        <app-dataset-header />
        <main class="flex-1 flex flex-col overflow-hidden">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class AppShellComponent {
  protected readonly sidebarCollapsed = signal(true);

  onSidebarCollapse(collapsed: boolean): void {
    this.sidebarCollapsed.set(collapsed);
  }
}
