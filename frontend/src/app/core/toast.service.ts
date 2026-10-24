import { Injectable, inject } from '@angular/core'
import { MatSnackBar } from '@angular/material/snack-bar'

@Injectable({ providedIn: 'root' })
export class ToastService {
  private snackBar = inject(MatSnackBar)

  success(message: string, duration = 3200) {
    this.snackBar.open(`✓ ${message}`, '关闭', {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['m3-snack-success'],
    })
  }

  error(message: string, duration = 4500) {
    this.snackBar.open(`✕ ${message}`, '关闭', {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['m3-snack-error'],
    })
  }

  info(message: string, duration = 3200) {
    this.snackBar.open(message, '好的', {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['m3-snack-info'],
    })
  }

  warning(message: string, duration = 3800) {
    this.snackBar.open(`⚠ ${message}`, '关闭', {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['m3-snack-warning'],
    })
  }
}
