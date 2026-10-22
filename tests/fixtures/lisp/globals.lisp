(defconstant +size+ 5)
(defvar *total* 0)
(defparameter *weights* (vector 3 1 4 1 5))

(defun add-all ()
  (dotimes (i +size+)
    (incf *total* (aref *weights* i))))

(add-all)
(format t "Total: ~d~%" *total*)
(setq *total* (* *total* 2))
(format t "Doubled: ~d~%" *total*)
(setf (aref *weights* 0) 10)
(format t "First weight: ~d, size ~d~%" (aref *weights* 0) (length *weights*))
